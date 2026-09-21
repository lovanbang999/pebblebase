import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Square, Copy, X, Search } from "lucide-react";
import {
  isDesktopApp,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  isDesktopWindowMaximized,
  closeDesktopWindow,
} from "@/lib/platform";

interface DesktopTitleBarProps {
  activeConnectionName?: string;
  activeDatabaseType?: string;
  onOpenCommandPalette?: () => void;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  activeConnectionName,
  activeDatabaseType,
  onOpenCommandPalette,
}) => {
  const { t } = useTranslation();
  const isDesktop = isDesktopApp();
  const [isMaximized, setIsMaximized] = useState(true);

  // Sync window maximized state reactively without polling
  useEffect(() => {
    if (!isDesktop) return;

    let mounted = true;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const checkMaximized = async () => {
      try {
        const maximized = await isDesktopWindowMaximized();
        if (mounted) setIsMaximized(maximized);
      } catch {
        // ignore check errors
      }
    };

    checkMaximized();

    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkMaximized, 100);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      mounted = false;
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, [isDesktop]);

  if (!isDesktop) {
    return null;
  }

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    minimizeDesktopWindow();
  };

  const handleToggleMaximize = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    toggleMaximizeDesktopWindow();
    // Optimistic toggle followed by verified state
    setIsMaximized((prev) => !prev);
    setTimeout(async () => {
      try {
        const maximized = await isDesktopWindowMaximized();
        setIsMaximized(maximized);
      } catch {
        // ignore check errors
      }
    }, 150);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeDesktopWindow();
  };

  // Only render or show drag bar if in desktop or web
  const dragStyle = {
    "--wails-draggable": "drag",
  } as React.CSSProperties;

  const noDragStyle = {
    "--wails-draggable": "no-drag",
  } as React.CSSProperties;

  return (
    <header
      style={dragStyle}
      onDoubleClick={handleToggleMaximize}
      className="dark:border-border/40 relative z-50 flex h-9.5 w-full shrink-0 items-center justify-between border-b border-zinc-200/80 bg-zinc-100/90 px-3 text-xs transition-colors select-none dark:bg-zinc-950/95"
    >
      {/* Left: Brand Identity & Active Connection */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <img
            src="/favicon.svg"
            alt="Pebblebase Logo"
            className="pointer-events-none h-4 w-4 object-contain"
          />
          <span className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
            Pebblebase Studio
            <span className="py-0.2 rounded border border-emerald-500/30 bg-emerald-500/10 px-1 font-mono text-[10px] leading-none text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-400">
              v0.1.1
            </span>
          </span>
        </div>

        {activeConnectionName && (
          <div
            style={noDragStyle}
            className="hidden items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white/90 px-2 py-0.5 text-[11px] text-zinc-700 shadow-2xs sm:flex dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="max-w-40 truncate font-medium text-zinc-800 dark:text-zinc-200">
              {activeConnectionName}
            </span>
            {activeDatabaseType && (
              <span className="font-mono text-[10px] text-zinc-400 uppercase dark:text-zinc-500">
                {activeDatabaseType}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center: Quick Search / Command Palette Trigger (Mathematically Centered in Titlebar) */}
      {onOpenCommandPalette && (
        <div className="pointer-events-none absolute left-1/2 w-64 max-w-[calc(100vw-420px)] -translate-x-1/2 sm:w-72 md:w-80">
          <button
            type="button"
            style={noDragStyle}
            onClick={onOpenCommandPalette}
            className="group pointer-events-auto flex h-6.5 w-full cursor-pointer items-center justify-between rounded-md border border-zinc-200/90 bg-white/80 px-2.5 text-[11px] text-zinc-500 shadow-2xs transition-colors hover:border-zinc-300 hover:bg-white hover:text-zinc-800 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:border-zinc-700/80 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-200"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Search className="h-3 w-3 shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300" />
              <span className="truncate">
                {t("titlebar.searchPlaceholder", "Search or run commands...")}
              </span>
            </span>
            <kbd className="py-0.2 hidden shrink-0 rounded border border-zinc-200/80 bg-zinc-100 px-1.5 font-mono text-[9px] text-zinc-500 sm:inline-block dark:border-zinc-700/80 dark:bg-zinc-800/90 dark:text-zinc-400">
              Ctrl K
            </kbd>
          </button>
        </div>
      )}

      {/* Right: Window Controls (Desktop Only) */}
      <div className="flex items-center gap-0.5">
        <div style={noDragStyle} className="flex items-center">
          {/* Minimize */}
          <button
            type="button"
            onClick={handleMinimize}
            className="flex h-6 w-8 cursor-pointer items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
            title={t("titlebar.minimize", "Minimize")}
            aria-label="Minimize Window"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>

          {/* Maximize / Restore */}
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="flex h-6 w-8 cursor-pointer items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
            title={
              isMaximized
                ? t("titlebar.restore", "Restore")
                : t("titlebar.maximize", "Maximize")
            }
            aria-label="Maximize or Restore Window"
          >
            {isMaximized ? (
              <Copy className="h-3 w-3 rotate-180" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={handleClose}
            className="flex h-6 w-8 cursor-pointer items-center justify-center rounded text-zinc-500 transition-colors hover:bg-red-600 hover:text-white dark:text-zinc-400 dark:hover:bg-red-600 dark:hover:text-white"
            title={t("titlebar.close", "Close")}
            aria-label="Close Window"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default DesktopTitleBar;
