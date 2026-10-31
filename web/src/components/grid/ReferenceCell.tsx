import { useId, useRef, useState } from "react";
import { resolveReferences } from "@/lib/api";
import type { ReferenceMatch } from "@/lib/referenceCache";

const shapedId = (value: unknown) =>
  typeof value === "string" &&
  (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  ) ||
    /^[0-9a-f]{24}$/i.test(value));

export function ReferenceCell({
  value,
  connectionId,
  workspaceId,
  tableName,
  declared,
  declaredForeignKey = false,
  onOpen,
  onFind,
}: {
  value: unknown;
  connectionId?: string;
  workspaceId?: string;
  tableName: string;
  declared?: { table: string; column: string };
  declaredForeignKey?: boolean;
  onOpen: (match: ReferenceMatch, value: unknown) => void;
  onFind?: (value: string) => void;
}) {
  const [matches, setMatches] = useState<ReferenceMatch[] | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const peekId = useId();
  const timer = useRef<number | undefined>(undefined);
  const request = async (): Promise<ReferenceMatch[]> => {
    if ((!declared && !shapedId(value)) || !connectionId || !workspaceId)
      return [];
    try {
      const result = await resolveReferences({
        workspaceId,
        currentConnectionId: connectionId,
        currentTable: tableName,
        value: String(value),
        ...(declared
          ? { declaredTable: declared.table, declaredColumn: declared.column }
          : {}),
      });
      setMatches(result.matches);
      return result.matches;
    } catch {
      setMatches([]);
      return [];
    }
  };
  const eligible = Boolean(declared || declaredForeignKey || shapedId(value));
  if (!eligible)
    return <span className="font-mono text-xs">{String(value)}</span>;
  const first = matches?.[0];
  const collisionCount =
    matches?.reduce(
      (total, match) => total + Math.max(match.count, match.rows.length),
      0,
    ) ?? 0;
  return (
    <span
      ref={containerRef}
      className="group/reference relative inline-flex max-w-full"
      onMouseEnter={() => {
        timer.current = window.setTimeout(() => {
          setPeekOpen(true);
          void request();
        }, 400);
      }}
      onMouseLeave={() => {
        window.clearTimeout(timer.current);
        if (!containerRef.current?.contains(document.activeElement))
          setPeekOpen(false);
      }}
      onFocusCapture={(event) => {
        if (event.target === event.currentTarget) return;
        setPeekOpen(true);
        void request();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setPeekOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && peekOpen) {
          event.stopPropagation();
          setPeekOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={peekOpen}
        aria-controls={peekId}
        className={`hover:text-primary max-w-full truncate font-mono text-xs ${declaredForeignKey || first ? "cursor-pointer underline decoration-dotted underline-offset-4" : "cursor-default"}`}
        title={
          declaredForeignKey && !declared
            ? "Foreign key metadata is available, but the target relation is incomplete."
            : first || declared
              ? "Referenced value; hover for a row preview"
              : "UUID/ObjectId candidate; hover to check for a matching primary key"
        }
        onClick={(event) => {
          event.stopPropagation();
          if (event.metaKey || event.ctrlKey) {
            if (first) onOpen(first, value);
            else
              void request().then((result) => {
                if (result[0]) onOpen(result[0], value);
              });
          }
        }}
      >
        {String(value)}
      </button>
      {peekOpen && (
        <span
          id={peekId}
          role="dialog"
          aria-label="Referenced row preview"
          className="border-border bg-popover text-popover-foreground absolute top-full left-0 z-[70] mt-1 w-72 rounded-md border p-2 text-xs shadow-xl"
        >
          {matches === null ? (
            <span
              role="status"
              aria-live="polite"
              className="text-muted-foreground"
            >
              Loading reference…
            </span>
          ) : first ? (
            <>
              <span className="text-muted-foreground block truncate">
                {first.connectionName} · {first.table}
              </span>
              <span className="mt-1 block max-h-32 overflow-auto font-mono">
                {Object.entries(first.rows[0] ?? {}).map(([key, item]) => (
                  <span className="block truncate" key={key}>
                    <b>{key}</b>:{" "}
                    {typeof item === "object"
                      ? JSON.stringify(item)
                      : String(item ?? "NULL")}
                  </span>
                ))}
              </span>
              {collisionCount > 1 && (
                <span className="text-muted-foreground mt-1 block">
                  +{collisionCount - 1} more
                </span>
              )}
              <span className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => onOpen(first, value)}
                >
                  Open
                </button>
                {onFind && (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => onFind(String(value))}
                  >
                    Follow everywhere
                  </button>
                )}
              </span>
            </>
          ) : declared && matches.length === 0 ? (
            <span className="text-warning">
              Declared foreign key points to a missing row.
            </span>
          ) : (
            <span className="text-muted-foreground">
              No referenced row found.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
