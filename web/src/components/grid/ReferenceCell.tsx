import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
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
  isPrimaryKey = false,
  hasIncomingReferences = false,
  onOpen,
  onNavigateRelation,
  onFind,
  onShowReferencedBy,
}: {
  value: unknown;
  connectionId?: string;
  workspaceId?: string;
  tableName: string;
  declared?: { table: string; column: string };
  declaredForeignKey?: boolean;
  isPrimaryKey?: boolean;
  hasIncomingReferences?: boolean;
  onOpen: (match: ReferenceMatch, value: unknown) => void;
  onNavigateRelation?: (
    targetTable: string,
    targetColumn: string,
    value: unknown,
  ) => void;
  onFind?: (value: string) => void;
  onShowReferencedBy?: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<ReferenceMatch[] | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const peekId = useId();
  const timer = useRef<number | undefined>(undefined);
  const requestAbort = useRef<AbortController | null>(null);
  const canResolveForward = Boolean(
    declared || declaredForeignKey || (!isPrimaryKey && shapedId(value)),
  );
  useEffect(
    () => () => {
      requestAbort.current?.abort();
      window.clearTimeout(timer.current);
    },
    [],
  );
  const request = async (): Promise<ReferenceMatch[]> => {
    if (
      (!declared && !declaredForeignKey && !shapedId(value)) ||
      !connectionId ||
      !workspaceId
    )
      return [];
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    try {
      const result = await resolveReferences(
        {
          workspaceId,
          currentConnectionId: connectionId,
          currentTable: tableName,
          value: String(value),
          ...(declared
            ? { declaredTable: declared.table, declaredColumn: declared.column }
            : {}),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return [];
      setMatches(result.matches);
      return result.matches;
    } catch {
      if (!controller.signal.aborted) setMatches([]);
      return [];
    }
  };
  const eligible = Boolean(
    declared || declaredForeignKey || isPrimaryKey || shapedId(value),
  );
  if (!eligible)
    return <span className="font-mono text-xs">{String(value)}</span>;
  const first = matches?.[0];
  const collisionCount =
    matches?.reduce(
      (total, match) => total + Math.max(match.count, match.rows.length),
      0,
    ) ?? 0;

  const handleQuickNavigate = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    window.clearTimeout(timer.current);
    setPeekOpen(false);

    if (declared) {
      const targetMatch: ReferenceMatch = {
        connectionId: connectionId || "",
        connectionName: "",
        table: declared.table,
        column: declared.column,
        count: 1,
        rows: [],
        rowIdentity: JSON.stringify([value]),
      };
      onOpen(targetMatch, value);
      onNavigateRelation?.(declared.table, declared.column, value);
      return;
    }

    if (matches && matches.length === 1) {
      onOpen(matches[0]!, value);
      return;
    }

    if (matches && matches.length > 1) {
      setPeekOpen(true);
      return;
    }

    void request().then((results) => {
      if (results.length === 1) {
        onOpen(results[0]!, value);
      } else if (results.length > 1) {
        setPeekOpen(true);
      } else if (declared) {
        setPeekOpen(true);
      }
    });
  };

  return (
    <span
      ref={containerRef}
      className="group/reference relative flex w-full max-w-full items-center justify-between gap-1"
      onMouseEnter={() => {
        if (!canResolveForward) return;
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
        if (event.target === event.currentTarget || !canResolveForward) return;
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
        aria-haspopup={
          canResolveForward || (isPrimaryKey && hasIncomingReferences)
            ? "dialog"
            : undefined
        }
        aria-expanded={peekOpen}
        aria-controls={peekId}
        className={`hover:text-primary max-w-full truncate font-mono text-xs ${declaredForeignKey || first ? "cursor-pointer underline decoration-dotted underline-offset-4" : isPrimaryKey && hasIncomingReferences ? "cursor-pointer" : "cursor-default"}`}
        title={
          declaredForeignKey && !declared
            ? t("reference.incompleteRelation")
            : isPrimaryKey && hasIncomingReferences
              ? t("reference.showReferencingTooltip")
              : first || declared
                ? t("reference.hoverPreview")
                : canResolveForward
                  ? t("reference.candidateHover")
                  : undefined
        }
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey) {
            event.stopPropagation();
            if (isPrimaryKey && hasIncomingReferences)
              onShowReferencedBy?.(value);
            else if (matches?.length === 1) onOpen(matches[0]!, value);
            else if (matches && matches.length > 1) setPeekOpen(true);
            else if (canResolveForward)
              void request().then((result) => {
                if (result.length === 1) onOpen(result[0]!, value);
                else if (result.length > 1) setPeekOpen(true);
                else if (declared) setPeekOpen(true);
              });
          }
        }}
      >
        {String(value)}
      </button>
      {canResolveForward && (
        <button
          type="button"
          aria-label={
            declared
              ? t("reference.goToReferencedRowInTable", {
                  table: declared.table,
                  column: declared.column,
                  value: String(value),
                  defaultValue: `Go to referenced row in ${declared.table}`,
                })
              : t("reference.quickGoToReferencedRow", "Go to referenced row")
          }
          title={
            declared
              ? t("reference.goToReferencedRowInTable", {
                  table: declared.table,
                  column: declared.column,
                  value: String(value),
                  defaultValue: `Go to referenced row in ${declared.table} (${declared.column} = ${value})`,
                })
              : t("reference.quickGoToReferencedRow", "Go to referenced row")
          }
          className="text-muted-foreground hover:text-primary hover:bg-accent/70 inline-flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 group-hover/reference:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
          onClick={handleQuickNavigate}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ArrowUpRight className="size-3" />
        </button>
      )}
      {isPrimaryKey &&
        hasIncomingReferences &&
        onShowReferencedBy &&
        !canResolveForward && (
          <button
            type="button"
            aria-label={t("reference.showReferencing")}
            title={t("reference.showReferencingTooltip")}
            className="text-muted-foreground hover:text-primary hover:bg-accent/70 inline-flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 group-hover/reference:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
            onClick={(event) => {
              event.stopPropagation();
              onShowReferencedBy(value);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ArrowUpRight className="size-3" />
          </button>
        )}
      {peekOpen && (
        <span
          id={peekId}
          role="dialog"
          aria-label={t("reference.preview")}
          className="border-border bg-popover text-popover-foreground absolute top-full left-0 z-70 mt-1 w-72 rounded-md border p-2 text-xs shadow-xl"
        >
          {matches === null ? (
            <span
              role="status"
              aria-live="polite"
              className="text-muted-foreground"
            >
              {t("reference.loading")}
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
                  {t("reference.more", { count: collisionCount - 1 })}
                </span>
              )}
              <span className="mt-2 flex flex-col gap-1">
                {matches?.map((match) => (
                  <button
                    key={`${match.connectionId}:${match.table}:${match.column}`}
                    type="button"
                    className="text-primary text-left hover:underline"
                    onClick={() => onOpen(match, value)}
                  >
                    {t("reference.openTarget", {
                      connection: match.connectionName,
                      table: match.table,
                      count: match.count,
                    })}
                  </button>
                ))}
                {onFind && (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => onFind(String(value))}
                  >
                    {t("reference.followEverywhere")}
                  </button>
                )}
              </span>
            </>
          ) : declared && matches.length === 0 ? (
            <span className="text-warning">{t("reference.missingRow")}</span>
          ) : (
            <span className="text-muted-foreground">
              {t("reference.noRowFound")}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
