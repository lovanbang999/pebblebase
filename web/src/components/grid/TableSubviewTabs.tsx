import type { FC } from "react";
import {
  Table as TableIcon,
  Columns3,
  ListTree,
  FileCode2,
} from "lucide-react";
import type { DatabaseType, TableSchema } from "@/lib/types";
import { cn } from "cn";
import { useTranslation } from "react-i18next";

export type TableSubview = "data" | "columns" | "indexes" | "ddl";

interface TableSubviewTabsProps {
  activeView: TableSubview;
  onViewChange: (view: TableSubview) => void;
  table: TableSchema;
  connectionName?: string;
  dbType?: DatabaseType;
}

const tabItems = [
  { id: "data", key: "dataView", fallback: "Data", Icon: TableIcon },
  { id: "columns", key: "columnsView", fallback: "Columns", Icon: Columns3 },
  { id: "indexes", key: "indexesView", fallback: "Indexes", Icon: ListTree },
  { id: "ddl", key: "ddlView", fallback: "DDL", Icon: FileCode2 },
] as const;

export const TableSubviewTabs: FC<TableSubviewTabsProps> = ({
  activeView,
  onViewChange,
  table,
  connectionName,
  dbType,
}) => (
  <TabsContent
    activeView={activeView}
    onViewChange={onViewChange}
    table={table}
    connectionName={connectionName}
    dbType={dbType}
  />
);

const TabsContent: FC<TableSubviewTabsProps> = ({
  activeView,
  onViewChange,
  table,
  connectionName,
  dbType,
}) => {
  const { t } = useTranslation();
  return (
    <div className="border-border bg-background dark:border-border dark:bg-background flex h-9 shrink-0 items-center gap-1 border-b px-3">
      <div
        role="tablist"
        aria-label={t("datagrid.tableViews", "Table views")}
        className="flex h-full items-center gap-1"
      >
        {tabItems
          .filter((item) => item.id !== "ddl" || dbType !== "mongodb")
          .map(({ id, key, fallback, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeView === id}
              onClick={() => onViewChange(id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 border-b-2 px-2.5 text-xs transition-colors",
                activeView === id
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              <Icon className="size-3.5" />
              {id === "columns" && dbType === "mongodb"
                ? t("datagrid.fieldsView", "Fields")
                : t(`datagrid.${key}`, fallback)}
            </button>
          ))}
      </div>
      <span className="flex-1" />
      <div
        className="text-muted-foreground min-w-0 truncate text-right font-mono text-[11px]"
        title={`${connectionName || ""} · ${table.name}`}
      >
        {connectionName && <span>{connectionName} · </span>}
        <span className="text-foreground">
          {table.schema_name ? `${table.schema_name}.` : ""}
          {table.name}
        </span>
      </div>
    </div>
  );
};
