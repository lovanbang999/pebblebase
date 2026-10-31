import { useEffect, useRef, type FC } from "react";
import { Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { OperationSeverity } from "@/lib/operationEvents";

export interface OperationEvent {
  id: string;
  kind: string;
  title: string;
  message: string;
  severity: OperationSeverity;
  connectionId?: string;
  connectionName?: string;
  tabId?: string;
  timestamp: number;
}

interface OutputPanelProps {
  events: OperationEvent[];
  onClear: () => void;
  onClose: () => void;
}

const severityClass: Record<OperationSeverity, string> = {
  success: "text-success",
  info: "text-primary",
  warning: "text-warning",
  error: "text-destructive",
};

export const OutputPanel: FC<OutputPanelProps> = ({
  events,
  onClear,
  onClose,
}) => {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      aria-label={t("operations.output", "Output")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
          document.getElementById("output-trigger")?.focus();
        }
      }}
      className="border-border bg-background flex h-52 max-h-[32dvh] min-h-32 shrink-0 flex-col border-t"
    >
      <header className="border-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="flex-1 text-xs font-semibold"
        >
          {t("operations.output", "Output")}
        </h2>
        <span className="text-muted-foreground text-[10px]">
          {t("operations.eventCount", {
            count: events.length,
            defaultValue: "{{count}} events",
          })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClear}
          disabled={!events.length}
          aria-label={t("operations.clear", "Clear output")}
          title={t("operations.clear", "Clear output")}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            onClose();
            document.getElementById("output-trigger")?.focus();
          }}
          aria-label={t("operations.hide", "Hide output")}
          title={t("operations.hide", "Hide output")}
        >
          <X className="size-3.5" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {events.length === 0 ? (
          <p className="text-muted-foreground p-4 text-xs">
            {t("operations.empty", "No operations yet")}
          </p>
        ) : (
          <ol className="divide-border divide-y">
            {events.map((event) => (
              <li
                key={event.id}
                className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs"
              >
                <time className="text-muted-foreground row-span-2 font-mono text-[10px]">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </time>
                <span
                  className={`font-medium ${severityClass[event.severity]}`}
                >
                  {event.title}
                </span>
                <span className="text-muted-foreground text-right text-[10px]">
                  {event.connectionName || event.connectionId || ""}
                </span>
                <span className="text-muted-foreground col-start-2 col-end-4 text-[11px] break-words">
                  {event.message}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};
