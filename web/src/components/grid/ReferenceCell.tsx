import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  onOpen,
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
  onOpen: (match: ReferenceMatch, value: unknown) => void;
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
  const canResolveForward = Boolean(declared || shapedId(value));
  useEffect(
    () => () => {
      requestAbort.current?.abort();
      window.clearTimeout(timer.current);
    },
    [],
  );
  const request = async (): Promise<ReferenceMatch[]> => {
    if ((!declared && !shapedId(value)) || !connectionId || !workspaceId)
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
  return (
    <span
      ref={containerRef}
      className="group/reference relative inline-flex max-w-full"
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
        aria-haspopup="dialog"
        aria-expanded={peekOpen}
        aria-controls={peekId}
        className={`hover:text-primary max-w-full truncate font-mono text-xs ${declaredForeignKey || first ? "cursor-pointer underline decoration-dotted underline-offset-4" : isPrimaryKey ? "cursor-pointer" : "cursor-default"}`}
        title={
          declaredForeignKey && !declared
            ? t("reference.incompleteRelation")
            : isPrimaryKey
              ? t("reference.showReferencingTooltip")
              : first || declared
                ? t("reference.hoverPreview")
                : t("reference.candidateHover")
        }
        onClick={(event) => {
          event.stopPropagation();
          if (event.metaKey || event.ctrlKey) {
            if (isPrimaryKey) onShowReferencedBy?.(value);
            else if (matches?.length === 1) onOpen(matches[0]!, value);
            else if (matches && matches.length > 1) setPeekOpen(true);
            else
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
      {isPrimaryKey && onShowReferencedBy && (
        <button
          type="button"
          aria-label={t("reference.showReferencing")}
          title={t("reference.showReferencingTooltip")}
          className="text-muted-foreground hover:text-primary absolute -right-4 opacity-0 transition-opacity group-hover/reference:opacity-100 focus-visible:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onShowReferencedBy(value);
          }}
        >
          ↗
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
