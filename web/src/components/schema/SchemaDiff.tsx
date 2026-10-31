import { useMemo, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  Copy,
  RefreshCw,
  Terminal,
  AlertTriangle,
} from "lucide-react";
import type { Connection } from "@/lib/types";
import { useSchemaMetadata } from "@/hooks/useSchemaMetadata";
import {
  defaultDiffSelection,
  diffPostgresSchemas,
  generateDiffScript,
  selectedDiffItems,
  type MetadataDiffItem,
} from "@/lib/postgresSchemaDiff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
interface SchemaDiffProps {
  connections: Connection[];
  activeConnectionId?: string | null;
  sourceConnectionId?: string;
  targetConnectionId?: string;
  onConnectionPairChange?: (source: string, target: string) => void;
  onOpenQueryConsole?: (
    query?: string,
    title?: string,
    destinationId?: string,
  ) => void;
  onError?: (message: string | null) => void;
}
export const SchemaDiff: FC<SchemaDiffProps> = ({
  connections,
  activeConnectionId,
  sourceConnectionId,
  targetConnectionId,
  onConnectionPairChange,
  onOpenQueryConsole,
}) => {
  const { t } = useTranslation();
  const postgres = connections.filter(
    (connection) => connection.type === "postgres",
  );
  const [localFrom, setLocalFrom] = useState(
    sourceConnectionId ?? activeConnectionId ?? postgres[0]?.id ?? "",
  );
  const [localTo, setLocalTo] = useState(
    targetConnectionId ??
      postgres.find((connection) => connection.id !== localFrom)?.id ??
      "",
  );
  const sourceCandidate = sourceConnectionId ?? localFrom;
  const sourceId = postgres.some(
    (connection) => connection.id === sourceCandidate,
  )
    ? sourceCandidate
    : (postgres[0]?.id ?? "");
  const destinationCandidate = targetConnectionId ?? localTo;
  const destinationId = postgres.some(
    (connection) =>
      connection.id === destinationCandidate && connection.id !== sourceId,
  )
    ? destinationCandidate
    : (postgres.find((connection) => connection.id !== sourceId)?.id ?? "");
  const source = useSchemaMetadata(
    postgres.some((connection) => connection.id === sourceId) ? sourceId : "",
  );
  const destination = useSchemaMetadata(
    postgres.some((connection) => connection.id === destinationId)
      ? destinationId
      : "",
  );
  const difference = useMemo(() => {
    if (!source.data || !destination.data)
      return { items: [] as MetadataDiffItem[], error: null };
    try {
      return {
        items: diffPostgresSchemas(source.data, destination.data),
        error: null,
      };
    } catch (error) {
      return {
        items: [] as MetadataDiffItem[],
        error:
          error instanceof Error ? error.message : t("diff.failed_compare"),
      };
    }
  }, [source.data, destination.data, t]);
  const setPair = (from: string, to: string) => {
    if (from === to)
      to = postgres.find((connection) => connection.id !== from)?.id ?? "";
    setLocalFrom(from);
    setLocalTo(to);
    onConnectionPairChange?.(from, to);
  };
  if (postgres.length < 2)
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-sm">
        {t("diff.postgresRequired")}
      </div>
    );
  const error =
    source.error?.message ?? destination.error?.message ?? difference.error;
  const valid =
    sourceId !== destinationId &&
    postgres.some((connection) => connection.id === sourceId) &&
    postgres.some((connection) => connection.id === destinationId);
  return (
    <div className="bg-background text-foreground flex h-full min-h-0 flex-col">
      <div className="border-border flex flex-wrap items-center gap-2 border-b p-3">
        <label className="flex items-center gap-2 text-xs">
          {t("diff.sourceLabel")}
          <select
            aria-label={t("diff.sourceLabel")}
            value={sourceId}
            onChange={(event) => setPair(event.target.value, destinationId)}
            className="bg-background border-border rounded border p-1.5"
          >
            {postgres.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t("diff.swapPair")}
          title={t("diff.swapPair")}
          onClick={() => setPair(destinationId, sourceId)}
        >
          <ArrowLeftRight className="size-4" />
        </Button>
        <label className="flex items-center gap-2 text-xs">
          {t("diff.destinationLabel")}
          <select
            aria-label={t("diff.destinationLabel")}
            value={destinationId}
            onChange={(event) => setPair(sourceId, event.target.value)}
            className="bg-background border-border rounded border p-1.5"
          >
            {postgres.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={source.isFetching || destination.isFetching}
          onClick={() =>
            void Promise.all([source.refresh(), destination.refresh()])
          }
        >
          <RefreshCw className="size-3.5" />
          {t("diff.refreshCatalog")}
        </Button>
        <span className="text-muted-foreground text-xs">
          {t("diff.directionDescription")}
        </span>
      </div>
      <p className="text-muted-foreground border-border border-b px-3 py-2 text-xs">
        {t("diff.scopeNotice")}
      </p>
      {!valid ? (
        <p role="status" className="p-6 text-sm">
          {t("diff.postgresRequired")}
        </p>
      ) : error ? (
        <p role="alert" className="text-destructive p-6 text-sm">
          {t("diff.catalogUnavailable")} {error}
        </p>
      ) : source.isLoading || destination.isLoading ? (
        <p role="status" className="p-6 text-sm">
          {t("diff.loadingCatalog")}
        </p>
      ) : source.data && destination.data ? (
        <DiffResults
          key={`${sourceId}:${destinationId}:${source.dataUpdatedAt}:${destination.dataUpdatedAt}`}
          items={difference.items}
          destinationId={destinationId}
          onOpenQueryConsole={onOpenQueryConsole}
        />
      ) : null}
    </div>
  );
};
function DiffResults({
  items,
  destinationId,
  onOpenQueryConsole,
}: {
  items: MetadataDiffItem[];
  destinationId: string;
  onOpenQueryConsole?: SchemaDiffProps["onOpenQueryConsole"];
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(() => defaultDiffSelection(items));
  const [focused, setFocused] = useState(items[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const effective = useMemo(
    () => new Set(selectedDiffItems(items, selected).map((item) => item.id)),
    [items, selected],
  );
  const script = useMemo(
    () => generateDiffScript(items, selected),
    [items, selected],
  );
  const focus = items.find((item) => item.id === focused);
  const filtered = items.filter((item) =>
    `${item.table} ${item.name} ${item.object}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selectAll = items.length > 0 && effective.size === items.length;
  const toggle = (item: MetadataDiffItem) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex flex-wrap items-center gap-3 border-b p-2 text-xs">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("diff.searchDifferences")}
          aria-label={t("diff.searchDifferences")}
          className="h-7 max-w-64"
        />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={selectAll}
            onChange={() =>
              setSelected(
                selectAll ? new Set() : new Set(items.map((item) => item.id)),
              )
            }
          />
          {t("diff.selectAllChanges")}
        </label>
        <span>
          {t("diff.selectionCount", {
            selected: effective.size,
            total: items.length,
          })}
        </span>
        <span className="text-warning flex items-center gap-1">
          <AlertTriangle className="size-3.5" />
          {t("diff.destructiveDefault")}
        </span>
      </div>
      {!items.length ? (
        <p className="text-muted-foreground p-6 text-sm">
          {t("diff.noMetadataDifferences")}
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,1fr)_2fr]">
          <div className="border-border overflow-auto border-r p-2">
            {filtered.map((item) => {
              const required = effective.has(item.id) && !selected.has(item.id);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "border-border mb-1 flex items-start gap-2 rounded border p-2 text-xs",
                    focused === item.id && "bg-accent",
                    item.destructive && "border-destructive/40",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`${item.kind} ${item.table} ${item.name}`}
                    checked={effective.has(item.id)}
                    disabled={required}
                    title={required ? t("diff.requiredDependency") : undefined}
                    onChange={() => toggle(item)}
                  />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setFocused(item.id)}
                  >
                    <span className="font-semibold">{item.table}</span>
                    <span className="block break-all">
                      {t(`diff.object.${item.object}`)} · {item.name} ·{" "}
                      {t(`diff.change.${item.kind}`)}
                    </span>
                    {required && (
                      <span className="text-muted-foreground">
                        {t("diff.requiredDependency")}
                      </span>
                    )}
                    {item.destructive && (
                      <span className="text-destructive mt-1 block font-semibold">
                        {t("diff.destructiveChange")}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <section
            className="min-w-0 overflow-auto p-3"
            aria-label={t("diff.focusSql")}
          >
            <h3 className="mb-2 text-xs font-semibold">{t("diff.focusSql")}</h3>
            <pre className="bg-muted rounded p-3 font-mono text-xs whitespace-pre-wrap">
              {focus?.steps
                .toSorted((a, b) => a.order - b.order)
                .map((step) => step.sql)
                .join("\n\n")}
            </pre>
          </section>
        </div>
      )}
      <section className="border-border flex max-h-[40%] min-h-32 flex-col border-t">
        <div className="flex items-center gap-2 p-2">
          <h3 className="flex-1 text-xs font-semibold">
            {t("diff.fullScript")}
          </h3>
          <Button
            variant="outline"
            size="sm"
            disabled={!script}
            onClick={() =>
              void navigator.clipboard
                .writeText(script)
                .then(() => setNotice(t("diff.copiedScript")))
                .catch(() => setNotice(t("diff.copyFailed")))
            }
          >
            <Copy className="size-3.5" />
            {t("diff.copyScript")}
          </Button>
          <Button
            size="sm"
            disabled={!script || !onOpenQueryConsole}
            onClick={() =>
              onOpenQueryConsole?.(
                script,
                t("diff.migrationTitle"),
                destinationId,
              )
            }
          >
            <Terminal className="size-3.5" />
            {t("diff.openDestinationConsole")}
          </Button>
        </div>
        {notice && (
          <p role="status" className="px-2 text-xs">
            {notice}
          </p>
        )}
        <pre className="bg-muted min-h-0 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
          {script || t("diff.noSelectedChanges")}
        </pre>
      </section>
    </div>
  );
}
