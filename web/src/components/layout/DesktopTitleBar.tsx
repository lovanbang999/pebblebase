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
      className="relative h-9.5 w-full shrink-0 bg-zinc-100/90 dark:bg-zinc-950/95 border-b border-zinc-200/80 dark:border-border/40 select-none flex items-center justify-between px-3 z-50 text-xs transition-colors"
    >
      {/* Left: Brand Identity & Active Connection */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <img
            src="/favicon.svg"
            alt="Pebblebase Logo"
            className="w-4 h-4 object-contain pointer-events-none"
          />
          <span className="font-semibold text-zinc-800 dark:text-zinc-100 tracking-tight text-xs flex items-center gap-1.5">
            Pebblebase Studio
            <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 dark:border-emerald-500/20 px-1 py-0.2 rounded leading-none">
              v0.1.1
            </span>
          </span>
        </div>

        {activeConnectionName && (
          <div
            style={noDragStyle}
            className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 shadow-2xs"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-40">
              {activeConnectionName}
            </span>
            {activeDatabaseType && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-mono">
                {activeDatabaseType}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center: Quick Search / Command Palette Trigger (Mathematically Centered in Titlebar) */}
      {onOpenCommandPalette && (
        <div className="absolute left-1/2 -translate-x-1/2 w-64 sm:w-72 md:w-80 max-w-[calc(100vw-420px)] pointer-events-none">
          <button
            type="button"
            style={noDragStyle}
            onClick={onOpenCommandPalette}
            className="w-full h-6.5 flex items-center justify-between px-2.5 rounded-md bg-white/80 hover:bg-white dark:bg-zinc-900/80 dark:hover:bg-zinc-800/80 border border-zinc-200/90 hover:border-zinc-300 dark:border-zinc-800/80 dark:hover:border-zinc-700/80 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-[11px] shadow-2xs transition-colors group cursor-pointer pointer-events-auto"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Search className="w-3 h-3 text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300 shrink-0" />
              <span className="truncate">
                {t("titlebar.searchPlaceholder", "Search or run commands...")}
              </span>
            </span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[9px] font-mono bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/80 rounded text-zinc-500 dark:text-zinc-400 shrink-0">
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
            className="w-8 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
            title={t("titlebar.minimize", "Minimize")}
            aria-label="Minimize Window"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Maximize / Restore */}
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="w-8 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
            title={
              isMaximized
                ? t("titlebar.restore", "Restore")
                : t("titlebar.maximize", "Maximize")
            }
            aria-label="Maximize or Restore Window"
          >
            {isMaximized ? (
              <Copy className="w-3 h-3 rotate-180" />
            ) : (
              <Square className="w-3 h-3" />
            )}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-red-600 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-red-600 transition-colors cursor-pointer"
            title={t("titlebar.close", "Close")}
            aria-label="Close Window"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default DesktopTitleBar;
