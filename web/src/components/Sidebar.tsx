import { useState, type FC } from 'react';
import {
  Database,
  Table as TableIcon,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ChevronDown,
  HardDrive,
  Key,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import type { Connection, TableSchema } from '../lib/types';

interface SidebarProps {
  connections: Connection[];
  selectedConnection: Connection | null;
  onSelectConnection: (conn: Connection) => void;
  onDeleteConnection: (id: string) => void;
  onOpenNewConnection: () => void;
  tables: TableSchema[];
  selectedTable: string | null;
  onSelectTable: (tableName: string) => void;
  isLoadingTables: boolean;
  onRefreshTables: () => void;
}

export const Sidebar: FC<SidebarProps> = ({
  connections,
  selectedConnection,
  onSelectConnection,
  onDeleteConnection,
  onOpenNewConnection,
  tables,
  selectedTable,
  onSelectTable,
  isLoadingTables,
  onRefreshTables,
}) => {
  const [tableSearch, setTableSearch] = useState('');
  const [showConnMenu, setShowConnMenu] = useState(false);

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <aside className="w-64 h-full bg-zinc-950 border-r border-zinc-800 flex flex-col select-none">
      {/* Brand Header */}
      <div className="h-12 px-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="font-semibold text-xs tracking-wider uppercase text-zinc-100 font-mono">
            Pebblebase
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenNewConnection}
          title="New Connection"
          className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Connection Switcher */}
      <div className="p-3 border-b border-zinc-800 relative">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Active Connection
          </span>
          {selectedConnection && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live
            </span>
          )}
        </div>

        {selectedConnection ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowConnMenu(!showConnMenu)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded text-left text-xs transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate font-medium text-zinc-200">
                  {selectedConnection.name}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            </button>

            {showConnMenu && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-zinc-900 border border-zinc-800 rounded shadow-xl py-1 divide-y divide-zinc-800/60 animate-in fade-in zoom-in-95 duration-100">
                <div className="max-h-48 overflow-y-auto">
                  {connections.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-zinc-800/80 cursor-pointer ${
                        c.id === selectedConnection.id ? 'bg-zinc-800/50 text-emerald-300' : 'text-zinc-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectConnection(c);
                          setShowConnMenu(false);
                        }}
                        className="flex-1 text-left flex items-center gap-1.5 truncate"
                      >
                        {c.id === selectedConnection.id && (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        )}
                        <span className="truncate">{c.name}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          ({c.db_name})
                        </span>
                      </button>
                      <button
                        type="button"
                        title="Delete connection"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove connection "${c.name}"?`)) {
                            onDeleteConnection(c.id);
                          }
                        }}
                        className="text-zinc-400 hover:text-rose-400 p-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowConnMenu(false);
                      onOpenNewConnection();
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-left text-emerald-400 hover:bg-zinc-800 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Connection...
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenNewConnection}
            className="w-full py-2 px-3 border border-dashed border-zinc-700 hover:border-emerald-500/60 rounded text-xs text-zinc-400 hover:text-emerald-400 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Connect Database
          </button>
        )}
      </div>

      {/* Tables Explorer */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Filter tables..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-400 focus:outline-hidden focus:border-emerald-500 font-mono"
            />
          </div>
          <button
            type="button"
            onClick={onRefreshTables}
            disabled={isLoadingTables || !selectedConnection}
            title="Refresh tables"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTables ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tables list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {!selectedConnection ? (
            <div className="py-8 px-3 text-center">
              <Database className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-400">No active connection</p>
              <p className="text-[11px] text-zinc-400 mt-1">Connect to introspect database</p>
            </div>
          ) : isLoadingTables ? (
            <div className="p-1 space-y-1 animate-in fade-in duration-150">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2.5 py-2 rounded bg-zinc-900/50 animate-pulse border border-zinc-900"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded bg-zinc-800" />
                    <div
                      className="h-3 rounded bg-zinc-800"
                      style={{ width: `${65 + (i % 4) * 20}px` }}
                    />
                  </div>
                  <div className="h-3 w-4 rounded bg-zinc-800/80" />
                </div>
              ))}
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="py-8 px-3 text-center text-xs text-zinc-500 font-mono">
              {tables.length === 0 ? 'No user tables found' : `No tables matching "${tableSearch}"`}
            </div>
          ) : (
            filteredTables.map((tbl) => {
              const isSelected = selectedTable === tbl.name;
              const hasPk = tbl.columns.some((c) => c.is_primary_key);
              const hasFk = tbl.columns.some((c) => c.is_foreign_key);

              return (
                <button
                  key={tbl.name}
                  type="button"
                  onClick={() => onSelectTable(tbl.name)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors text-left group ${
                    isSelected
                      ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-200'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <TableIcon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-zinc-300'
                      }`}
                    />
                    <span className="truncate font-mono">{tbl.name}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {hasPk && (
                      <span title="Has primary key">
                        <Key className="w-2.5 h-2.5 text-amber-400/80" />
                      </span>
                    )}
                    {hasFk && (
                      <span title="Has foreign relations">
                        <Layers className="w-2.5 h-2.5 text-sky-400/80" />
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-1 rounded font-mono ${
                        isSelected
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : 'bg-zinc-800/80 text-zinc-400'
                      }`}
                    >
                      {tbl.columns.length}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-zinc-800 text-[11px] text-zinc-400 font-mono flex items-center justify-between">
        <span>Go 1.22 + React 19</span>
        <span className="text-zinc-400">Pebblebase v0.1</span>
      </div>
    </aside>
  );
};
