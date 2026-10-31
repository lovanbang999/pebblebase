import { type FC, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Table as TableIcon,
  ExternalLink,
  FileCode,
  Terminal,
  Hash,
  PlusCircle,
  Copy,
  Download,
  FileJson,
  Pin,
  AlertTriangle,
  Trash2,
} from "lucide-react";

export interface TableContextMenuProps {
  tableName: string;
  x: number;
  y: number;
  isPinned: boolean;
  onClose: () => void;
  onOpenTable: (openInNewTab: boolean) => void;
  onViewSchema: () => void;
  onQuerySelectTop100: () => void;
  onQuerySelectCount: () => void;
  onQueryInsertTemplate: () => void;
  onCopyTableName: () => void;
  onCopySelectQuery: () => void;
  onExport: (format: "csv" | "json") => void;
  onTogglePin: () => void;
  onDangerAction: (type: "truncate" | "drop") => void;
}

export const TableContextMenu: FC<TableContextMenuProps> = ({
  tableName,
  x,
  y,
  isPinned,
  onClose,
  onOpenTable,
  onViewSchema,
  onQuerySelectTop100,
  onQuerySelectCount,
  onQueryInsertTemplate,
  onCopyTableName,
  onCopySelectQuery,
  onExport,
  onTogglePin,
  onDangerAction,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // Clamp inside viewport
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const padding = 10;
    let newX = x;
    let newY = y;

    if (newX + rect.width > window.innerWidth - padding) {
      newX = window.innerWidth - rect.width - padding;
    }
    if (newX < padding) newX = padding;

    if (newY + rect.height > window.innerHeight - padding) {
      newY = window.innerHeight - rect.height - padding;
    }
    if (newY < padding) newY = padding;

    setAdjustedPos({ x: newX, y: newY });
  }, [x, y]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={
        {
          top: `${adjustedPos.y}px`,
          left: `${adjustedPos.x}px`,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties
      }
      role="menu"
      aria-label={t("explorer.tableActions", "{{table}} actions", {
        table: tableName,
      })}
      onKeyDown={(event) => {
        const items = [
          ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]',
          ) || []),
        ];
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
          items.length
        ) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      className="animate-in fade-in-50 zoom-in-95 wails-no-drag bg-popover text-popover-foreground border-border fixed z-50 min-w-56 overflow-hidden rounded-md border p-1 font-mono text-xs shadow-lg duration-100"
    >
      {/* Table Name Header */}
      <div className="border-border/80 dark:border-border/80 flex items-center gap-2 border-b px-2.5 py-1.5">
        <TableIcon className="text-success dark:text-success size-3.5 shrink-0" />
        <span className="text-foreground truncate font-semibold">
          {tableName}
        </span>
      </div>

      <div className="py-1">
        {/* Open Options */}
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onOpenTable(false);
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <TableIcon className="text-muted-foreground size-3.5" />
          <span>{t("sidebar.tableMenu.openDataGrid")}</span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onOpenTable(true);
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <ExternalLink className="text-muted-foreground size-3.5" />
          <span>{t("sidebar.tableMenu.openInNewTab")}</span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onViewSchema();
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <FileCode className="size-3.5 text-sky-500 dark:text-sky-400" />
          <span>{t("sidebar.tableMenu.viewSchema")}</span>
        </button>
      </div>

      <div className="bg-muted/80 dark:bg-muted/80 h-px" />

      {/* Query Shortcuts */}
      <div className="py-1">
        <div className="text-muted-foreground dark:text-muted-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
          {t("sidebar.tableMenu.queryMenu")}
        </div>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onQuerySelectTop100();
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <Terminal className="text-success dark:text-success size-3.5" />
          <span>{t("sidebar.tableMenu.selectTop100")}</span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onQuerySelectCount();
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <Hash className="text-primary dark:text-primary size-3.5" />
          <span>{t("sidebar.tableMenu.selectCount")}</span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onQueryInsertTemplate();
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <PlusCircle className="size-3.5 text-cyan-500 dark:text-cyan-400" />
          <span>{t("sidebar.tableMenu.insertTemplate")}</span>
        </button>
      </div>

      <div className="bg-muted/80 dark:bg-muted/80 h-px" />

      {/* Copy & Export */}
      <div className="py-1">
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onCopyTableName();
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <Copy className="text-muted-foreground size-3.5" />
          <span>{t("sidebar.tableMenu.copyTableName")}</span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onCopySelectQuery();
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <Terminal className="text-muted-foreground size-3.5" />
          <span>{t("sidebar.tableMenu.copySelectQuery")}</span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onExport("csv");
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <Download className="text-muted-foreground size-3.5" />
          <span>{t("sidebar.tableMenu.exportCsv")}</span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onExport("json");
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <FileJson className="text-muted-foreground size-3.5" />
          <span>{t("sidebar.tableMenu.exportJson")}</span>
        </button>
      </div>

      <div className="bg-muted/80 dark:bg-muted/80 h-px" />

      {/* Pin & Danger Zone */}
      <div className="py-1">
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onTogglePin();
            onClose();
          }}
          className="hover:bg-muted dark:hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <Pin
            className={`size-3.5 ${
              isPinned
                ? "text-warning rotate-45 fill-current"
                : "text-muted-foreground"
            }`}
          />
          <span>
            {isPinned
              ? t("sidebar.tableMenu.unpinTable")
              : t("sidebar.tableMenu.pinTable")}
          </span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onDangerAction("truncate");
            onClose();
          }}
          className="text-warning hover:bg-warning/10 dark:text-warning dark:hover:bg-warning/10 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <AlertTriangle className="size-3.5" />
          <span>{t("sidebar.tableMenu.truncateTable")}</span>
        </button>

        <button
          role="menuitem"
          type="button"
          onClick={() => {
            onDangerAction("drop");
            onClose();
          }}
          className="text-destructive hover:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/10 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <Trash2 className="size-3.5" />
          <span>{t("sidebar.tableMenu.dropTable")}</span>
        </button>
      </div>
    </div>
  );
};
