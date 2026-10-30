import { useTranslation } from "react-i18next";
import {
  Database,
  Terminal,
  Workflow,
  GitCompare,
  Plus,
  Search,
  ArrowUpRight,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Connection } from "@/lib/types";

interface Props {
  connection: Connection | null | undefined;
  tables: string[];
  isLoading: boolean;
  onOpenTable: (name: string) => void;
  onQuery: () => void;
  onErd: () => void;
  onDiff: () => void;
  onNewConnection: () => void;
  onSearch: () => void;
}

export function WorkspaceHome({
  connection,
  tables,
  isLoading,
  onOpenTable,
  onQuery,
  onErd,
  onDiff,
  onNewConnection,
  onSearch,
}: Props) {
  const { t } = useTranslation();
  const tools = [
    {
      label: t("sidebar.queryConsole"),
      description: t("workspace.queryHelp"),
      icon: Terminal,
      action: onQuery,
    },
    {
      label: t("erd.title"),
      description: t("workspace.erdHelp"),
      icon: Workflow,
      action: onErd,
    },
    ...(connection?.type !== "mongodb"
      ? [
          {
            label: t("diff.title"),
            description: t("workspace.diffHelp"),
            icon: GitCompare,
            action: onDiff,
          },
        ]
      : []),
  ];
  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 flex-col">
      <header className="border-border flex h-9 shrink-0 items-center gap-3 border-b px-4">
        <SidebarTrigger />
        <span className="text-muted-foreground text-sm">
          {t("workspace.title")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground ml-auto gap-2"
          onClick={onSearch}
        >
          <Search aria-hidden="true" className="size-4" />
          {t("workspace.findAnything")}
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-9 flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
                <Database aria-hidden="true" className="text-primary size-4" />
                {t("workspace.title")}
              </div>
              <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">
                {connection?.name || t("sidebar.pebblebaseStudio")}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {t("workspace.subtitle")}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-9 gap-2"
              onClick={onNewConnection}
            >
              <Plus aria-hidden="true" className="size-4" />
              {t("sidebar.newConnection")}
            </Button>
          </div>
          {connection && connection.type !== "redis" && (
            <section
              aria-label={t("workspace.tools")}
              className={`border-border mb-10 grid grid-cols-1 divide-y rounded-xl border sm:grid-cols-2 sm:divide-y-0 ${tools.length === 3 ? "lg:grid-cols-3" : ""}`}
            >
              {tools.map(({ label, description, icon: Icon, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className="hover:bg-muted/60 focus-visible:ring-ring group flex cursor-pointer items-start gap-3 rounded-xl p-5 text-left transition-colors outline-none focus-visible:ring-2"
                >
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-400"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {label}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                      />
                    </span>
                    <span className="text-muted-foreground mt-1.5 block text-xs leading-relaxed">
                      {description}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          )}
          <section aria-labelledby="workspace-tables">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="workspace-tables" className="text-sm font-semibold">
                {t("sidebar.tablesHeader")}{" "}
                <span className="text-muted-foreground ml-1 font-normal">
                  {tables.length}
                </span>
              </h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={onSearch}
                className="text-muted-foreground gap-2"
              >
                <Search aria-hidden="true" className="size-3.5" />
                {t("workspace.browseAll")}
              </Button>
            </div>
            {isLoading ? (
              <p role="status" className="text-muted-foreground py-8 text-sm">
                {t("workspace.loading")}
              </p>
            ) : tables.length ? (
              <div className="border-border grid grid-cols-1 gap-x-8 border-t sm:grid-cols-2">
                {tables.slice(0, 10).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onOpenTable(name)}
                    className="border-border hover:bg-muted/60 focus-visible:ring-ring flex cursor-pointer items-center gap-3 rounded-md border-b px-3 py-3 text-left outline-none focus-visible:ring-2"
                  >
                    <Table2
                      aria-hidden="true"
                      className="text-muted-foreground size-4 shrink-0"
                    />
                    <span className="truncate font-mono text-xs">{name}</span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="text-muted-foreground ml-auto size-3.5 shrink-0"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="border-border text-muted-foreground rounded-xl border border-dashed px-6 py-6 text-center text-sm">
                {t("workspace.emptyTables")}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
