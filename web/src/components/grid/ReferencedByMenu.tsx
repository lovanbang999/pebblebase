import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueries } from "@tanstack/react-query";
import { fetchRows, fetchSchemaMetadata, findEverywhere } from "@/lib/api";
import {
  incomingReferencesFromMetadata,
  filtersForReference,
  isInferredReferenceValue,
  targetRowIdentity,
} from "@/lib/referenceNavigation";
import { mapSchemaMetadata, schemaMetadataKey } from "@/lib/schemaMetadata";
import type { Connection } from "@/lib/types";
import type { NavigationCandidate } from "@/lib/referenceNavigation";

interface Props {
  open: boolean;
  workspaceId: string;
  connections: Connection[];
  sourceTabId: string;
  sourceConnectionId: string;
  sourceTable: string;
  sourceColumn: string;
  value: unknown;
  row: Record<string, unknown>;
  onClose: () => void;
  onOpenTarget: (candidate: NavigationCandidate) => void;
}

function isProduction(connection: Connection) {
  return String(connection.environment).toLowerCase() === "production";
}

export function ReferencedByMenu({
  open,
  workspaceId,
  connections,
  sourceTabId,
  sourceConnectionId,
  sourceTable,
  sourceColumn,
  value,
  row,
  onClose,
  onOpenTarget,
}: Props) {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<NavigationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);
  const [includeProduction, setIncludeProduction] = useState(false);
  const eligible = useMemo(
    () =>
      connections
        .filter((connection) => includeProduction || !isProduction(connection))
        .slice(0, 24),
    [connections, includeProduction],
  );
  const metadataConnections = useMemo(
    () => eligible.filter((connection) => connection.type !== "redis"),
    [eligible],
  );
  const metadataQueries = useQueries({
    queries: metadataConnections.map((connection) => ({
      queryKey: schemaMetadataKey(connection.id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchSchemaMetadata(connection.id, undefined, signal).then(
          mapSchemaMetadata,
        ),
      enabled: open && connection.type !== "redis",
      staleTime: 60_000,
    })),
  });
  const metadataUpdated = metadataQueries
    .map((query) => query.dataUpdatedAt)
    .join(",");
  const metadataReady = metadataQueries.every(
    (query) => query.data || query.isError,
  );
  const metadataSources = useMemo(
    () =>
      metadataQueries.flatMap((query, index) => {
        const metadata = query.data;
        const connection = metadataConnections[index];
        return metadata && connection
          ? [
              {
                connectionId: connection.id,
                connectionName: connection.name,
                metadata,
              },
            ]
          : [];
      }),
    [metadataConnections, metadataUpdated],
  );

  useEffect(() => {
    if (!open || !metadataReady || value == null || String(value) === "") {
      setTargets([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setTargets([]);
    setPartial(false);
    setLoading(true);
    const ids = eligible.map((connection) => connection.id);
    const addTarget = (target: NavigationCandidate) => {
      if (controller.signal.aborted) return;
      setTargets((current) => {
        const existing = current.findIndex((item) => item.id === target.id);
        if (existing < 0)
          return current.length < 30 ? [...current, target] : current;
        const next = [...current];
        next[existing] = { ...next[existing]!, ...target };
        return next;
      });
    };

    const run = async () => {
      const declared = incomingReferencesFromMetadata(metadataSources, {
        connectionId: sourceConnectionId,
        table: sourceTable,
        column: sourceColumn,
      }).slice(0, 30);
      await Promise.all(
        declared.map(async (reference) => {
          const filters = filtersForReference(
            reference.columns,
            reference.referencedColumns,
            row,
          );
          if (!filters.length || controller.signal.aborted) return;
          const timeout = new AbortController();
          const abort = () => timeout.abort();
          controller.signal.addEventListener("abort", abort, { once: true });
          const timer = window.setTimeout(abort, 300);
          try {
            const result = await fetchRows(
              reference.connectionId,
              reference.table,
              { limit: 1, filters },
              timeout.signal,
            );
            const metadata = metadataSources.find(
              (source) => source.connectionId === reference.connectionId,
            )?.metadata;
            const table = metadata?.tables.find(
              (candidate) => candidate.name === reference.table,
            );
            const keys =
              table?.primary_key ??
              table?.columns
                .filter((column) => column.is_primary_key)
                .map((column) => column.name) ??
              [];
            const candidate: NavigationCandidate = {
              id: `${reference.connectionId}:${reference.table}:${reference.columns.join(",")}`,
              connectionId: reference.connectionId,
              connectionName: reference.connectionName,
              table: reference.table,
              column: reference.columns[0]!,
              count: result.total_count,
              filters,
              rowIdentity: result.rows[0]
                ? targetRowIdentity(result.rows[0], keys)
                : undefined,
              engine: metadata?.engine,
            };
            addTarget(candidate);
          } catch {
            if (!controller.signal.aborted) setPartial(true);
          } finally {
            window.clearTimeout(timer);
            controller.signal.removeEventListener("abort", abort);
          }
        }),
      );

      if (controller.signal.aborted) return;
      if (!isInferredReferenceValue(value)) {
        setLoading(false);
        return;
      }
      try {
        await findEverywhere(
          String(value),
          ids,
          false,
          controller.signal,
          (connectionResult) => {
            for (const match of connectionResult.matches) {
              if (
                connectionResult.connectionId === sourceConnectionId &&
                match.table === sourceTable &&
                match.column === sourceColumn
              )
                continue;
              const metadata = metadataSources.find(
                (source) =>
                  source.connectionId === connectionResult.connectionId,
              )?.metadata;
              const connection = eligible.find(
                (source) => source.id === connectionResult.connectionId,
              );
              const table = metadata?.tables.find(
                (candidate) => candidate.name === match.table,
              );
              const keys =
                table?.primary_key ??
                table?.columns
                  .filter((column) => column.is_primary_key)
                  .map((column) => column.name) ??
                [];
              addTarget({
                id: `${connectionResult.connectionId}:${match.table}:${match.column}`,
                connectionId: connectionResult.connectionId,
                connectionName: match.connectionName,
                table: match.table,
                column: match.column,
                count: match.count,
                filters: [
                  {
                    column: match.column,
                    operator: "eq",
                    value: String(value),
                  },
                ],
                rowIdentity: match.rows[0]
                  ? targetRowIdentity(match.rows[0], keys)
                  : undefined,
                engine: metadata?.engine ?? connection?.type,
                redisKey:
                  connection?.type === "redis"
                    ? String(match.rows[0]?.key ?? value)
                    : undefined,
              });
            }
            if (
              connectionResult.status === "failed" ||
              connectionResult.status === "partial"
            )
              setPartial(true);
          },
        );
      } catch {
        if (!controller.signal.aborted) setPartial(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [
    open,
    metadataReady,
    metadataUpdated,
    metadataSources,
    workspaceId,
    sourceTabId,
    sourceConnectionId,
    sourceTable,
    sourceColumn,
    value,
    row,
    eligible,
  ]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label={t("reference.menuTitle")}
      className="border-border bg-popover text-popover-foreground absolute right-4 bottom-4 z-90 w-80 rounded-md border p-2 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <strong>{t("reference.menuTitle")}</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("reference.closeMenu")}
        >
          ×
        </button>
      </div>
      <div className="text-muted-foreground py-2 font-mono text-xs">
        {String(value)}
      </div>
      {connections.some(isProduction) && (
        <label className="text-muted-foreground flex items-start gap-2 border-b pb-2 text-xs">
          <input
            type="checkbox"
            checked={includeProduction}
            onChange={(event) => setIncludeProduction(event.target.checked)}
          />
          <span>
            {t("reference.includeProduction")}
            {includeProduction && (
              <span className="text-warning block">
                {t("reference.productionWarning")}
              </span>
            )}
          </span>
        </label>
      )}
      <div className="max-h-64 space-y-1 overflow-auto">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            className="hover:bg-accent flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs"
            onClick={() => onOpenTarget(target)}
          >
            <span className="truncate">
              {target.connectionName && `${target.connectionName} · `}
              {target.table}.{target.column}
            </span>
            <span className="text-muted-foreground ml-2 shrink-0">
              {t("reference.rowCount", { count: target.count })}
            </span>
          </button>
        ))}
        {!loading && targets.length === 0 && (
          <p className="text-muted-foreground p-2 text-xs">
            {t("reference.noIncomingFound")}
          </p>
        )}
        {partial && (
          <p role="status" className="text-warning p-2 text-xs">
            {t("reference.partialWarning")}
          </p>
        )}
        {loading && (
          <p role="status" className="text-muted-foreground p-2 text-xs">
            {t("reference.checking")}
          </p>
        )}
      </div>
      {loading && (
        <button
          type="button"
          className="text-primary mt-2 text-xs"
          onClick={onClose}
        >
          {t("common.cancel")}
        </button>
      )}
    </div>
  );
}
