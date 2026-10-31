import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Play, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fetchTables } from "@/lib/api";
import type { Connection, TableSchema } from "@/lib/types";
import { RUN_FROM_LOG_SAMPLES, parseRunFromLog } from "@/lib/runFromLog";

interface Props {
  open: boolean;
  onClose: () => void;
  connections: Connection[];
  currentConnection?: Connection | null;
  tablesByConnection: Record<string, TableSchema[]>;
  onRun: (connectionId: string, statement: string) => void;
}

const acceptsEngine = (connection: Connection, kind: string) => {
  if (kind === "redis") return connection.type === "redis";
  if (kind === "mongoose") return connection.type === "mongodb";
  if (kind === "typeorm" || kind === "prisma")
    return ["postgres", "mysql", "sqlite", "mssql", "clickhouse"].includes(
      connection.type,
    );
  return false;
};

export function RunFromLogDialog({
  open,
  onClose,
  connections,
  currentConnection,
  tablesByConnection,
  onRun,
}: Props) {
  const [log, setLog] = useState("");
  const [tables, setTables] =
    useState<Record<string, TableSchema[]>>(tablesByConnection);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [copyState, setCopyState] = useState(false);
  const wasOpen = useRef(false);
  const parsed = useMemo(() => parseRunFromLog(log), [log]);
  const candidates = useMemo(
    () =>
      connections.filter((connection) =>
        acceptsEngine(connection, parsed.kind),
      ),
    [connections, parsed.kind],
  );
  const suitable = useMemo(() => {
    if (parsed.kind === "redis") return candidates;
    if (!parsed.tableName) return [];
    const table = parsed.tableName.toLocaleLowerCase();
    return candidates.filter((connection) =>
      (tables[connection.id] ?? []).some(
        (item) => item.name.toLocaleLowerCase() === table,
      ),
    );
  }, [candidates, parsed.kind, parsed.tableName, tables]);
  const chosen =
    suitable.find((connection) => connection.id === selectedConnectionId) ??
    suitable.find((connection) => connection.id === currentConnection?.id) ??
    suitable[0];

  useEffect(() => {
    if (open && !wasOpen.current) {
      setLog("");
      setTables(tablesByConnection);
      setSelectedConnectionId("");
    }
    wasOpen.current = open;
  }, [open, tablesByConnection]);

  useEffect(() => {
    if (!open || !parsed.tableName) return;
    const missing = candidates.filter(
      (connection) => tables[connection.id] === undefined,
    );
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(
      missing.map(async (connection) => {
        try {
          const result = await fetchTables(connection.id, controller.signal);
          setTables((previous) => ({ ...previous, [connection.id]: result }));
        } catch {
          if (!controller.signal.aborted)
            setTables((previous) => ({ ...previous, [connection.id]: [] }));
        }
      }),
    );
    return () => controller.abort();
  }, [open, parsed.tableName, candidates, tables]);

  const copyStatement = async () => {
    try {
      await navigator.clipboard.writeText(parsed.statement);
      setCopyState(true);
      window.setTimeout(() => setCopyState(false), 1200);
    } catch {
      setCopyState(false);
    }
  };

  const noTargetMessage =
    parsed.kind === "unknown"
      ? "Paste a supported TypeORM, Prisma, Mongoose, or Redis log line."
      : parsed.kind === "redis"
        ? "No Redis connection is available in the current workspace."
        : !parsed.tableName
          ? "The table or collection could not be identified from this statement."
          : `No ${parsed.kind === "mongoose" ? "MongoDB" : "SQL"} connection in this workspace has “${parsed.tableName}”.`;
  const highlightedStatement = parsed.statement
    ? parsed.statement
        .split(
          /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|\b(?:select|from|where|join|left|right|inner|outer|on|as|and|or|not|null|true|false|insert|into|values|update|set|delete|returning|order|by|group|limit|offset|with|having)\b|\b\d+(?:\.\d+)?\b)/gi,
        )
        .map((part, index) => {
          const className = /^(--|\/\*)/.test(part)
            ? "text-muted-foreground"
            : /^(?:'|")/.test(part)
              ? "text-emerald-500"
              : /^(?:\d)/.test(part)
                ? "text-amber-500"
                : /^(?:select|from|where|join|left|right|inner|outer|on|as|and|or|not|null|true|false|insert|into|values|update|set|delete|returning|order|by|group|limit|offset|with|having)$/i.test(
                      part,
                    )
                  ? "text-primary font-semibold"
                  : "";
          return className ? (
            <span key={index} className={className}>
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          );
        })
    : "Statement preview will appear here.";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-border border-b p-5">
          <DialogTitle className="flex items-center gap-2">
            <WandSparkles className="size-4" />
            Run from Log
          </DialogTitle>
          <DialogDescription>
            Parse a database log into a statement. Nothing runs until you choose
            Run in console.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">
              Paste query or command log
            </span>
            <div className="flex flex-wrap gap-1">
              {RUN_FROM_LOG_SAMPLES.map((sample) => (
                <Button
                  key={sample.label}
                  size="xs"
                  variant="outline"
                  onClick={() => setLog(sample.text)}
                >
                  {sample.label} sample
                </Button>
              ))}
            </div>
          </div>
          <Textarea
            aria-label="Database log"
            value={log}
            onChange={(event) => setLog(event.target.value)}
            className="min-h-28 font-mono text-xs"
            placeholder="Paste a TypeORM, Prisma, Mongoose, or Redis log…"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-muted rounded px-2 py-1">
              Source: {parsed.sourceLabel}
            </span>
            <span className="bg-muted rounded px-2 py-1">
              {parsed.parameters.length} parameter
              {parsed.parameters.length === 1 ? "" : "s"}
            </span>
            {parsed.parameters.map((parameter, index) => (
              <span
                key={index}
                className="border-border max-w-48 truncate rounded border px-2 py-1 font-mono"
                title={String(parameter)}
              >
                {JSON.stringify(parameter)}
              </span>
            ))}
          </div>
          {parsed.warnings.map((warning, index) => (
            <p key={index} className="text-destructive text-xs">
              {warning}
            </p>
          ))}
          <div>
            <div className="text-muted-foreground mb-1 text-xs">
              Bound statement preview
            </div>
            <pre className="bg-muted/50 border-border max-h-52 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
              {highlightedStatement}
            </pre>
          </div>
          <label className="grid gap-1 text-xs">
            <span>Target connection</span>
            <select
              aria-label="Target connection"
              className="border-input bg-background h-8 rounded-md border px-2"
              value={chosen?.id ?? ""}
              onChange={(event) => setSelectedConnectionId(event.target.value)}
            >
              {suitable.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name} ({connection.type.toUpperCase()})
                  {connection.environment === "production"
                    ? " · Production"
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {!chosen && (
            <p className="text-muted-foreground text-xs">{noTargetMessage}</p>
          )}
        </div>
        <DialogFooter className="border-border border-t p-4">
          <Button
            variant="outline"
            onClick={() => void copyStatement()}
            disabled={!parsed.statement}
          >
            <Clipboard className="size-3.5" />
            {copyState ? (
              <>
                <Check className="size-3.5" />
                Copied
              </>
            ) : (
              "Copy statement"
            )}
          </Button>
          <Button
            onClick={() =>
              chosen && parsed.statement && onRun(chosen.id, parsed.statement)
            }
            disabled={!chosen || !parsed.statement || parsed.kind === "unknown"}
          >
            <Play className="size-3.5" />
            Run in console
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
