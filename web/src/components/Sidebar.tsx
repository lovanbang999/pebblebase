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
  Sun,
  Moon,
} from 'lucide-react';
import type { Connection, TableSchema } from '../lib/types';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

interface SidebarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
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
  theme,
  onToggleTheme,
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

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <SidebarPrimitive
      collapsible="icon"
      className="select-none transition-colors border-r border-sidebar-border bg-sidebar"
    >
      {/* Brand Header & Quick Actions */}
      <SidebarHeader className="p-2 gap-2 border-b border-sidebar-border">
        <div className="flex items-center justify-between h-9 px-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="size-7 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Database className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="font-semibold text-xs tracking-wider uppercase text-zinc-900 dark:text-zinc-100 font-mono truncate group-data-[collapsible=icon]:hidden">
              Pebblebase
            </span>
          </div>

          <div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onToggleTheme}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {theme === 'dark' ? (
                      <Sun className="size-3.5 text-amber-400" />
                    ) : (
                      <Moon className="size-3.5 text-indigo-600" />
                    )}
                  </Button>
                }
              />
              <TooltipContent side="bottom">
                {theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onOpenNewConnection}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">New Connection</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Active Connection Switcher */}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={
                      selectedConnection
                        ? `${selectedConnection.name} (${selectedConnection.db_name})`
                        : "Connect Database"
                    }
                    className="w-full data-[state=open]:bg-sidebar-accent cursor-pointer group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                  >
                    <div className="size-7 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                      <HardDrive className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex flex-col gap-0.5 leading-none truncate flex-1 text-left group-data-[collapsible=icon]:hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-muted-foreground">Active DB</span>
                        {selectedConnection && (
                          <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium truncate text-foreground">
                        {selectedConnection ? selectedConnection.name : "Select Connection"}
                      </span>
                    </div>
                    <ChevronDown className="ml-auto size-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden shrink-0" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent className="w-56" align="start" side="bottom">
                <div className="max-h-48 overflow-y-auto">
                  {connections.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => onSelectConnection(c)}
                      className={`flex items-center justify-between text-xs cursor-pointer ${
                        c.id === selectedConnection?.id
                          ? 'text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-50/50 dark:bg-emerald-950/30'
                          : 'text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate flex-1">
                        {c.id === selectedConnection?.id && (
                          <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                        <span className="truncate">{c.name}</span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                          ({c.db_name})
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        title="Delete connection"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove connection "${c.name}"?`)) {
                            onDeleteConnection(c.id);
                          }
                        }}
                        className="text-zinc-400 hover:text-rose-500 h-5 w-5 ml-1"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </DropdownMenuItem>
                  ))}
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onOpenNewConnection}
                  className="text-xs text-emerald-600 dark:text-emerald-400 font-medium cursor-pointer"
                >
                  <Plus className="size-3.5 mr-1" />
                  New Connection...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Tables Explorer Content */}
      <SidebarContent className="gap-0">
        {/* Table Filter Input (Hidden when collapsed) */}
        <div className="p-2 border-b border-sidebar-border group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="size-3.5 text-zinc-400 absolute left-2 top-2 pointer-events-none" />
              <Input
                type="text"
                placeholder="Filter tables..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="pl-7 pr-2 h-7 text-xs font-mono"
              />
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onRefreshTables}
                    disabled={isLoadingTables || !selectedConnection}
                    className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 h-7 w-7 shrink-0"
                  >
                    <RefreshCw className={cn("size-3.5", isLoadingTables && "animate-spin")} />
                  </Button>
                }
              />
              <TooltipContent side="right">Refresh tables</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Tables Group */}
        <SidebarGroup className="p-1.5 flex-1 overflow-y-auto">
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono px-2 mb-1 group-data-[collapsible=icon]:hidden">
            Tables {tables.length > 0 ? `(${filteredTables.length}/${tables.length})` : ''}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            {!selectedConnection ? (
              <div className="py-8 px-2 text-center group-data-[collapsible=icon]:hidden">
                <Database className="size-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">No active connection</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-1">Connect to introspect database</p>
              </div>
            ) : isLoadingTables ? (
              <div className="p-1 space-y-1 animate-in fade-in duration-150">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2 py-1.5 rounded bg-zinc-100/60 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-900 group-data-[collapsible=icon]:justify-center"
                  >
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-3.5 rounded" />
                      <Skeleton
                        className="h-3 rounded group-data-[collapsible=icon]:hidden"
                        style={{ width: `${65 + (i % 4) * 20}px` }}
                      />
                    </div>
                    <Skeleton className="h-3 w-4 rounded group-data-[collapsible=icon]:hidden" />
                  </div>
                ))}
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="py-8 px-2 text-center text-xs text-zinc-500 font-mono group-data-[collapsible=icon]:hidden">
                {tables.length === 0 ? 'No user tables found' : `No tables matching "${tableSearch}"`}
              </div>
            ) : (
              <SidebarMenu>
                {filteredTables.map((tbl) => {
                  const isSelected = selectedTable === tbl.name;
                  const hasPk = tbl.columns.some((c) => c.is_primary_key);
                  const hasFk = tbl.columns.some((c) => c.is_foreign_key);

                  return (
                    <SidebarMenuItem key={tbl.name}>
                      <SidebarMenuButton
                        isActive={isSelected}
                        onClick={() => onSelectTable(tbl.name)}
                        tooltip={`${tbl.name} (${tbl.columns.length} cols)`}
                        className={cn(
                          "font-mono text-xs cursor-pointer h-7 px-2 transition-colors",
                          isSelected
                            ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-semibold border border-emerald-500/30"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
                        )}
                      >
                        <TableIcon
                          className={cn(
                            "size-3.5 shrink-0",
                            isSelected
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-400 dark:text-zinc-500"
                          )}
                        />
                        <span className="truncate group-data-[collapsible=icon]:hidden">{tbl.name}</span>

                        <div className="ml-auto flex items-center gap-1 shrink-0 group-data-[collapsible=icon]:hidden">
                          {hasPk && (
                            <span title="Primary key">
                              <Key className="size-2.5 text-amber-500 dark:text-amber-400/80" />
                            </span>
                          )}
                          {hasFk && (
                            <span title="Foreign relations">
                              <Layers className="size-2.5 text-sky-500 dark:text-sky-400/80" />
                            </span>
                          )}
                          <Badge
                            variant={isSelected ? "default" : "secondary"}
                            className="text-[10px] px-1 h-4 font-mono font-normal"
                          >
                            {tbl.columns.length}
                          </Badge>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer & Collapsed Shortcuts */}
      <SidebarFooter className="border-t border-sidebar-border p-2">
        {/* In collapsed icon mode: quick theme, new conn and expand triggers */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onToggleTheme}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {theme === 'dark' ? (
                    <Sun className="size-3.5 text-amber-400" />
                  ) : (
                    <Moon className="size-3.5 text-indigo-600" />
                  )}
                </Button>
              }
            />
            <TooltipContent side="right">
              {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenNewConnection}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  <Plus className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="right">New Connection</TooltipContent>
          </Tooltip>
        </div>

        {/* In expanded mode: version specs */}
        <div className="group-data-[collapsible=icon]:hidden text-[11px] text-zinc-500 dark:text-zinc-400 font-mono flex items-center justify-between">
          <span>Go 1.22 + React 19</span>
          <span>v0.1</span>
        </div>
      </SidebarFooter>

      {/* Edge Rail for smooth click-to-toggle */}
      <SidebarRail />
    </SidebarPrimitive>
  );
};
