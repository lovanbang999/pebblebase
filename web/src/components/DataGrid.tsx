import { useMemo, useState, useEffect, useRef, type FC, type FormEvent } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  RefreshCw,
  Filter as FilterIcon,
  X,
  Key,
  Layers,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Table as TableIcon,
  ArrowUpRight,
  Search,
  Inbox,
} from 'lucide-react';
import type { TableSchema, FilterOption } from '../lib/types';
import { EmptyState } from './EmptyState';

interface DataGridProps {
  table: TableSchema;
  rows: Record<string, any>[];
  totalCount: number;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  sortBy: string;
  sortDesc: boolean;
  onSortChange: (column: string, desc: boolean) => void;
  filters: FilterOption[];
  onFiltersChange: (filters: FilterOption[]) => void;
  onRefresh: () => void;
  onAddRow: () => void;
  onEditRow: (row: Record<string, any>) => void;
  onDeleteRow: (row: Record<string, any>) => void;
  onNavigateRelation?: (targetTable: string, targetColumn: string, value: any) => void;
}

export const DataGrid: FC<DataGridProps> = ({
  table,
  rows,
  totalCount,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortDesc,
  onSortChange,
  filters,
  onFiltersChange,
  onRefresh,
  onAddRow,
  onEditRow,
  onDeleteRow,
  onNavigateRelation,
}) => {
  // Filter Builder state
  const [filterCol, setFilterCol] = useState(table.columns[0]?.name || '');
  const [filterOp, setFilterOp] = useState<'eq' | 'neq' | 'gt' | 'lt' | 'contains'>('eq');
  const [filterVal, setFilterVal] = useState('');
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);

  // Quick Search state with 300ms debounce
  const [quickSearch, setQuickSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const quickSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(quickSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [quickSearch]);

  // Global shortcut: '/' focuses quick search, 'Escape' clears it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        quickSearchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === quickSearchInputRef.current) {
        setQuickSearch('');
        quickSearchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update filterCol when table changes
  useEffect(() => {
    setFilterCol(table.columns[0]?.name || '');
  }, [table]);

  // Discover extra fields from rows that were not in sampled table.columns
  const extraColumns = useMemo(() => {
    const schemaColNames = new Set(table.columns.map((c) => c.name));
    const extras = new Set<string>();
    rows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (!schemaColNames.has(k) && !k.startsWith('_pb_')) {
          extras.add(k);
        }
      });
    });
    return Array.from(extras).sort();
  }, [table.columns, rows]);

  // Client-side quick search filtering across all properties
  const displayedRows = useMemo(() => {
    if (!debouncedSearch.trim()) return rows;
    const term = debouncedSearch.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) =>
        v !== null && v !== undefined && String(v).toLowerCase().includes(term)
      )
    );
  }, [rows, debouncedSearch]);

  // TanStack Table columns
  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => {
    const cols: ColumnDef<Record<string, any>>[] = [
      {
        id: '_row_index',
        header: '#',
        size: 50,
        cell: (info) => (
          <span className="text-zinc-500 font-mono text-[11px] select-none">
            {page * pageSize + info.row.index + 1}
          </span>
        ),
      },
    ];

    // Standard schema columns
    table.columns.forEach((col) => {
      cols.push({
        id: col.name,
        accessorKey: col.name,
        header: () => {
          const isSorted = sortBy === col.name;
          return (
            <div
              className="flex items-center justify-between gap-1.5 cursor-pointer select-none group py-1"
              onClick={() => {
                if (sortBy === col.name) {
                  if (sortDesc) {
                    onSortChange('', false);
                  } else {
                    onSortChange(col.name, true);
                  }
                } else {
                  onSortChange(col.name, false);
                }
              }}
            >
              <div className="flex items-center gap-1.5 truncate">
                {col.is_primary_key && (
                  <span title="Primary Key">
                    <Key className="w-3 h-3 text-amber-400 shrink-0" />
                  </span>
                )}
                {col.is_foreign_key && (
                  <span title="Foreign Key">
                    <Layers className="w-3 h-3 text-sky-400 shrink-0" />
                  </span>
                )}
                <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                  {col.name}
                </span>
                <span className="text-[10px] font-mono text-zinc-400 font-normal px-1 rounded bg-zinc-800/80">
                  {col.type}
                </span>
              </div>

              <div className="text-zinc-400 group-hover:text-zinc-200">
                {isSorted ? (
                  sortDesc ? (
                    <ArrowDown className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowUp className="w-3 h-3 text-emerald-400" />
                  )
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </div>
          );
        },
        cell: (info) => {
          const val = info.getValue();

          // Graceful handling of missing / null fields
          if (val === undefined) {
            return (
              <span
                className="text-zinc-600 italic text-[11px] font-mono select-none"
                title="Field not set on this record"
              >
                —
              </span>
            );
          }
          if (val === null) {
            return <span className="text-zinc-500 italic text-[11px] font-mono">NULL</span>;
          }

          // Signature Prisma Studio Click-to-Navigate Foreign Key
          if (col.is_foreign_key && onNavigateRelation) {
            const rel = table.relations?.find((r) => r.from_column === col.name);
            if (rel) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateRelation(rel.to_table, rel.to_column, val);
                  }}
                  className="inline-flex items-center gap-1 font-mono text-xs text-sky-400 hover:text-sky-300 hover:underline group/fk text-left px-1.5 py-0.5 rounded bg-sky-950/20 hover:bg-sky-950/50 border border-sky-800/30 transition-colors"
                  title={`Navigate to ${rel.to_table} where ${rel.to_column} = ${val}`}
                >
                  <span className="font-semibold">{String(val)}</span>
                  <ArrowUpRight className="w-3 h-3 opacity-70 group-hover/fk:opacity-100 group-hover/fk:translate-x-0.5 group-hover/fk:-translate-y-0.5 transition-all shrink-0" />
                </button>
              );
            }
          }

          // Booleans
          if (typeof val === 'boolean') {
            return (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                  val
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {String(val)}
              </span>
            );
          }

          // Objects / Arrays / BSON
          if (typeof val === 'object') {
            return (
              <span
                className="font-mono text-xs text-amber-300/90 truncate block max-w-xs cursor-help"
                title={JSON.stringify(val, null, 2)}
              >
                {JSON.stringify(val)}
              </span>
            );
          }

          // Primary key highlight
          if (col.is_primary_key) {
            return (
              <span className="font-mono text-xs font-semibold text-zinc-100 truncate block">
                {String(val)}
              </span>
            );
          }

          return (
            <span className="font-mono text-xs text-zinc-300 truncate block">
              {String(val)}
            </span>
          );
        },
      });
    });

    // Dynamic extra columns found in schemaless documents
    extraColumns.forEach((extraColName) => {
      cols.push({
        id: `_extra_${extraColName}`,
        accessorKey: extraColName,
        header: () => {
          const isSorted = sortBy === extraColName;
          return (
            <div
              className="flex items-center justify-between gap-1.5 cursor-pointer select-none group py-1"
              onClick={() => {
                if (sortBy === extraColName) {
                  if (sortDesc) {
                    onSortChange('', false);
                  } else {
                    onSortChange(extraColName, true);
                  }
                } else {
                  onSortChange(extraColName, false);
                }
              }}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono text-xs font-semibold text-amber-200/90 truncate">
                  {extraColName}
                </span>
                <span className="text-[9px] font-mono text-amber-400/90 font-normal px-1 py-0.2 rounded bg-amber-950/50 border border-amber-800/40">
                  dynamic
                </span>
              </div>
              <div className="text-zinc-400 group-hover:text-zinc-200">
                {isSorted ? (
                  sortDesc ? (
                    <ArrowDown className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowUp className="w-3 h-3 text-emerald-400" />
                  )
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </div>
          );
        },
        cell: (info) => {
          const val = info.getValue();
          if (val === undefined) {
            return (
              <span
                className="text-zinc-600 italic text-[11px] font-mono select-none"
                title="Field not set on this record"
              >
                —
              </span>
            );
          }
          if (val === null) {
            return <span className="text-zinc-500 italic text-[11px] font-mono">NULL</span>;
          }
          if (typeof val === 'boolean') {
            return (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                  val
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {String(val)}
              </span>
            );
          }
          if (typeof val === 'object') {
            return (
              <span
                className="font-mono text-xs text-amber-300/90 truncate block max-w-xs cursor-help"
                title={JSON.stringify(val, null, 2)}
              >
                {JSON.stringify(val)}
              </span>
            );
          }
          return (
            <span className="font-mono text-xs text-zinc-300 truncate block">
              {String(val)}
            </span>
          );
        },
      });
    });

    // Row Actions column
    cols.push({
      id: '_actions',
      header: '',
      size: 70,
      cell: (info) => (
        <div className="flex items-center justify-end gap-1 opacity-60 hover:opacity-100 transition-opacity">
          <button
            type="button"
            title="Edit record"
            onClick={(e) => {
              e.stopPropagation();
              onEditRow(info.row.original);
            }}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            title="Delete record"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRow(info.row.original);
            }}
            className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ),
    });

    return cols;
  }, [table, extraColumns, sortBy, sortDesc, onSortChange, page, pageSize, onEditRow, onDeleteRow, onNavigateRelation]);

  const reactTable = useReactTable({
    data: displayedRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleAddFilter = (e: FormEvent) => {
    e.preventDefault();
    if (!filterCol || !filterVal) return;
    onFiltersChange([...filters, { column: filterCol, operator: filterOp, value: filterVal }]);
    setFilterVal('');
  };

  const handleRemoveFilter = (index: number) => {
    const updated = [...filters];
    updated.splice(index, 1);
    onFiltersChange(updated);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden">
      {/* Top Action Bar */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-900/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-emerald-400" />
            <h2 className="font-mono text-sm font-semibold text-zinc-100">{table.name}</h2>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {totalCount.toLocaleString()} {totalCount === 1 ? 'record' : 'records'}
          </span>
          {displayedRows.length !== rows.length && (
            <span className="text-[11px] text-amber-400/90 font-mono bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.2 rounded">
              Showing {displayedRows.length} matches
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Search Input */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              ref={quickSearchInputRef}
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Search view... (/)"
              className="pl-8 pr-7 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500 font-mono w-44 focus:w-60 transition-all shadow-inner"
            />
            {quickSearch && (
              <button
                type="button"
                onClick={() => setQuickSearch('')}
                className="absolute right-2 text-zinc-500 hover:text-zinc-300"
                title="Clear search (Esc)"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilterBuilder(!showFilterBuilder)}
            className={`px-2.5 py-1.5 rounded text-xs font-mono font-medium border flex items-center gap-1.5 transition-colors ${
              filters.length > 0 || showFilterBuilder
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <FilterIcon className="w-3.5 h-3.5" />
            Filter
            {filters.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-bold flex items-center justify-center">
                {filters.length}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            title="Reload table data"
            className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Add Row CTA */}
          <button
            type="button"
            onClick={onAddRow}
            className="px-3 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors font-semibold shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </button>
        </div>
      </div>

      {/* Filter Builder & Active Filter Chips */}
      {(showFilterBuilder || filters.length > 0) && (
        <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/40 space-y-2">
          {showFilterBuilder && (
            <form onSubmit={handleAddFilter} className="flex items-center gap-2 flex-wrap text-xs font-mono">
              <span className="text-zinc-400">WHERE</span>
              <select
                value={filterCol}
                onChange={(e) => setFilterCol(e.target.value)}
                className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-hidden focus:border-emerald-500"
              >
                {table.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {extraColumns.map((extra) => (
                  <option key={extra} value={extra}>
                    {extra} (dynamic)
                  </option>
                ))}
              </select>

              <select
                value={filterOp}
                onChange={(e) => setFilterOp(e.target.value as any)}
                className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-hidden focus:border-emerald-500"
              >
                <option value="eq">=</option>
                <option value="neq">≠</option>
                <option value="gt">&gt;</option>
                <option value="lt">&lt;</option>
                <option value="contains">CONTAINS</option>
              </select>

              <input
                type="text"
                value={filterVal}
                onChange={(e) => setFilterVal(e.target.value)}
                placeholder="Value..."
                className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-emerald-500 w-44"
              />

              <button
                type="submit"
                disabled={!filterVal}
                className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium disabled:opacity-40"
              >
                Apply
              </button>
            </form>
          )}

          {/* Active chips */}
          {filters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-zinc-400 uppercase font-mono tracking-wider mr-1">
                Active:
              </span>
              {filters.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-mono"
                >
                  <span className="font-semibold">{f.column}</span>
                  <span className="text-zinc-400">{f.operator}</span>
                  <span className="text-zinc-200 font-medium">{f.value}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFilter(i)}
                    className="hover:text-rose-400 ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => onFiltersChange([])}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 ml-2 underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid Container */}
      <div className="flex-1 overflow-auto relative flex flex-col">
        {isLoading ? (
          /* Loading Skeletons */
          <div className="flex-1 overflow-hidden p-4 space-y-2 animate-in fade-in duration-200">
            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/20">
              <div className="h-10 border-b border-zinc-800 bg-zinc-900/60 px-4 flex items-center gap-4">
                <div className="h-3 w-6 rounded bg-zinc-800 animate-pulse" />
                {table.columns.slice(0, 5).map((c) => (
                  <div key={c.name} className="h-3.5 w-28 rounded bg-zinc-800/80 animate-pulse" />
                ))}
              </div>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((rowIdx) => (
                <div
                  key={rowIdx}
                  className="h-10 border-b border-zinc-800/40 px-4 flex items-center gap-4"
                >
                  <div className="h-3 w-6 rounded bg-zinc-800/80 animate-pulse" />
                  <div className="h-3 w-28 rounded bg-zinc-800/60 animate-pulse" />
                  <div className="h-3 w-40 rounded bg-zinc-800/60 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-zinc-800/60 animate-pulse" />
                  <div className="h-3 w-32 rounded bg-zinc-800/60 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ) : displayedRows.length === 0 ? (
          /* Empty States */
          <div className="flex-1 flex items-center justify-center p-8">
            {quickSearch ? (
              <EmptyState
                icon={Search}
                title="No search results"
                description={`No records matching "${quickSearch}" in current view.`}
                action={{
                  label: 'Clear search',
                  onClick: () => setQuickSearch(''),
                }}
              />
            ) : filters.length > 0 ? (
              <EmptyState
                icon={FilterIcon}
                title="No matching records"
                description="No records match the active filter criteria."
                action={{
                  label: 'Clear all filters',
                  onClick: () => onFiltersChange([]),
                }}
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title="Table is empty"
                description={`No records have been inserted into "${table.name}" yet.`}
                action={{
                  label: 'Insert first record',
                  onClick: onAddRow,
                  icon: Plus,
                }}
              />
            )}
          </div>
        ) : (
          /* Data Table */
          <table className="w-full border-collapse text-left border-b border-zinc-800">
            <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800">
              {reactTable.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className="px-3 py-2 text-xs font-medium text-zinc-400 border-r border-zinc-800/80 last:border-r-0 whitespace-nowrap"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            <tbody className="divide-y divide-zinc-800/50">
              {reactTable.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-zinc-900/60 transition-colors group cursor-pointer"
                  onClick={() => onEditRow(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2 text-xs border-r border-zinc-800/40 last:border-r-0 whitespace-nowrap max-w-sm truncate"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="h-11 px-4 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-3">
          <span>
            {totalCount === 0
              ? '0 records'
              : `Showing ${page * pageSize + 1} - ${Math.min((page + 1) * pageSize, totalCount)} of ${totalCount}`}
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[11px] text-zinc-400">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-300 text-xs focus:outline-hidden focus:border-emerald-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => onPageChange(page - 1)}
              className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
