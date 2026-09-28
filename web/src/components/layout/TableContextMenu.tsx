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
      className="animate-in fade-in-50 zoom-in-95 wails-no-drag fixed z-50 min-w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white/95 p-1 font-mono text-xs text-zinc-700 shadow-2xl backdrop-blur-md duration-100 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-200"
    >
      {/* Table Name Header */}
      <div className="flex items-center gap-2 border-b border-zinc-200/80 px-2.5 py-1.5 dark:border-zinc-800/80">
        <TableIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
          {tableName}
        </span>
      </div>

      <div className="py-1">
        {/* Open Options */}
        <button
          type="button"
          onClick={() => {
            onOpenTable(false);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <TableIcon className="size-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>{t("sidebar.tableMenu.openDataGrid")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenTable(true);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <ExternalLink className="size-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>{t("sidebar.tableMenu.openInNewTab")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onViewSchema();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <FileCode className="size-3.5 text-sky-500 dark:text-sky-400" />
          <span>{t("sidebar.tableMenu.viewSchema")}</span>
        </button>
      </div>

      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80" />

      {/* Query Shortcuts */}
      <div className="py-1">
        <div className="px-2 py-0.5 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
          {t("sidebar.tableMenu.queryMenu")}
        </div>

        <button
          type="button"
          onClick={() => {
            onQuerySelectTop100();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <Terminal className="size-3.5 text-emerald-500 dark:text-emerald-400" />
          <span>{t("sidebar.tableMenu.selectTop100")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onQuerySelectCount();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <Hash className="size-3.5 text-indigo-500 dark:text-indigo-400" />
          <span>{t("sidebar.tableMenu.selectCount")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onQueryInsertTemplate();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <PlusCircle className="size-3.5 text-cyan-500 dark:text-cyan-400" />
          <span>{t("sidebar.tableMenu.insertTemplate")}</span>
        </button>
      </div>

      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80" />

      {/* Copy & Export */}
      <div className="py-1">
        <button
          type="button"
          onClick={() => {
            onCopyTableName();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <Copy className="size-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>{t("sidebar.tableMenu.copyTableName")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCopySelectQuery();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <Terminal className="size-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>{t("sidebar.tableMenu.copySelectQuery")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onExport("csv");
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <Download className="size-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>{t("sidebar.tableMenu.exportCsv")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onExport("json");
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <FileJson className="size-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>{t("sidebar.tableMenu.exportJson")}</span>
        </button>
      </div>

      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80" />

      {/* Pin & Danger Zone */}
      <div className="py-1">
        <button
          type="button"
          onClick={() => {
            onTogglePin();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        >
          <Pin
            className={`size-3.5 ${
              isPinned
                ? "rotate-45 fill-current text-amber-500"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          />
          <span>
            {isPinned
              ? t("sidebar.tableMenu.unpinTable")
              : t("sidebar.tableMenu.pinTable")}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onDangerAction("truncate");
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/10"
        >
          <AlertTriangle className="size-3.5" />
          <span>{t("sidebar.tableMenu.truncateTable")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onDangerAction("drop");
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="size-3.5" />
          <span>{t("sidebar.tableMenu.dropTable")}</span>
        </button>
      </div>
    </div>
  );
};
