import { useEffect, useRef, type FC } from "react";
import { Check, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OperationEvent } from "./OutputPanel";
import { Button } from "@/components/ui/button";

interface NotificationPanelProps {
  open: boolean;
  notifications: (OperationEvent & { read: boolean })[];
  onReadAll: () => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export const NotificationPanel: FC<NotificationPanelProps> = ({
  open,
  notifications,
  onReadAll,
  onDismiss,
  onClear,
  onClose,
}) => {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) {
      onReadAll();
      headingRef.current?.focus();
    }
  }, [open, onReadAll]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
          document.getElementById("notifications-trigger")?.focus();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
          document.getElementById("notifications-trigger")?.focus();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="notification-panel-title"
        className="border-border bg-background absolute top-[calc(var(--titlebar-height)+8px)] right-11 flex max-h-[min(70dvh,520px)] w-[min(380px,calc(100vw-56px))] flex-col overflow-hidden rounded-lg border shadow-xl"
      >
        <header className="border-border flex h-10 items-center gap-2 border-b px-3">
          <h2
            id="notification-panel-title"
            ref={headingRef}
            tabIndex={-1}
            className="flex-1 text-xs font-semibold"
          >
            {t("operations.notifications", "Notifications")}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClear}
            disabled={!notifications.length}
            aria-label={t(
              "operations.clearNotifications",
              "Clear notifications",
            )}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              onClose();
              document.getElementById("notifications-trigger")?.focus();
            }}
            aria-label={t("common.close", "Close")}
          >
            <X className="size-3.5" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          {notifications.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">
              {t("operations.noNotifications", "You're all caught up")}
            </p>
          ) : (
            notifications.map((item) => (
              <article
                key={item.id}
                className="border-border flex gap-2 border-b px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{item.title}</div>
                  <p className="text-muted-foreground mt-0.5 text-[11px] break-words">
                    {item.message}
                  </p>
                  <time className="text-muted-foreground mt-1 block text-[10px]">
                    {new Date(item.timestamp).toLocaleString()}
                  </time>
                </div>
                {!item.read && (
                  <span
                    className="bg-primary mt-1 size-2 shrink-0 rounded-full"
                    aria-label={t("operations.unread", "Unread")}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onDismiss(item.id)}
                  aria-label={t("operations.dismiss", "Dismiss notification")}
                >
                  <Check className="size-3.5" />
                </Button>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
