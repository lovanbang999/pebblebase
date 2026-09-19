import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FC,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Table as TableIcon,
  Terminal,
  FileCode,
  Workflow,
  X,
  Plus,
  Copy,
  ArrowRight,
  Layers,
  ChevronLeft,
  ChevronRight,
  GitCompare,
} from "lucide-react";
import type { StudioTab } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "cn";

interface TabBarProps {
  tabs: StudioTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onDuplicateTab: (tabId: string) => void;
  onNewQueryTab: () => void;
}

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

export const TabBar: FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onDuplicateTab,
  onNewQueryTab,
}) => {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const targetScrollRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Check scroll bounds for chevron buttons and overflow styling
  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [tabs, checkScroll]);

  // Native non-passive mouse wheel listener to strictly block vertical page scrolling & enable buttery-smooth lerp horizontal scroll
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      const delta = e.deltaY || e.deltaX;
      if (delta !== 0) {
        // Prevent default vertical page scroll strictly (requires non-passive listener)
        e.preventDefault();

        // Initialize target scroll if loop is inactive
        if (animationFrameRef.current === null) {
          targetScrollRef.current = el.scrollLeft;
        }

        const maxScroll = el.scrollWidth - el.clientWidth;
        targetScrollRef.current = Math.min(
          Math.max(0, targetScrollRef.current + delta * 1.15),
          maxScroll,
        );

        const animateScroll = () => {
          if (!scrollContainerRef.current) {
            animationFrameRef.current = null;
            return;
          }

          const current = scrollContainerRef.current.scrollLeft;
          const diff = targetScrollRef.current - current;

          if (Math.abs(diff) > 0.4) {
            scrollContainerRef.current.scrollLeft = current + diff * 0.18;
            checkScroll();
            animationFrameRef.current = requestAnimationFrame(animateScroll);
          } else {
            scrollContainerRef.current.scrollLeft = targetScrollRef.current;
            checkScroll();
            animationFrameRef.current = null;
          }
        };

        if (animationFrameRef.current === null) {
          animationFrameRef.current = requestAnimationFrame(animateScroll);
        }
      }
    };

    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleNativeWheel);
    };
  }, [checkScroll]);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!activeTabId || !scrollContainerRef.current) return;
    const activeTabElement = scrollContainerRef.current.querySelector(
      `[data-tab-id="${activeTabId}"]`,
    );
    if (activeTabElement) {
      activeTabElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
      setTimeout(checkScroll, 300);
    }
  }, [activeTabId, checkScroll]);

  const handleScrollBy = useCallback(
    (direction: "left" | "right") => {
      const el = scrollContainerRef.current;
      if (!el) return;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const delta = direction === "left" ? -240 : 240;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const newTarget = Math.min(Math.max(0, el.scrollLeft + delta), maxScroll);
      targetScrollRef.current = newTarget;

      el.scrollTo({ left: newTarget, behavior: "smooth" });
      setTimeout(checkScroll, 300);
    },
    [checkScroll],
  );

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleOutsideClick = (e: globalThis.MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  // Handle right-click context menu on tab
  const handleContextMenu = (e: MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Clamp inside viewport
    const menuWidth = 190;
    const menuHeight = 150;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);

    setContextMenu({ tabId, x, y });
  };

  // Middle-click to close tab
  const handleMouseDown = (e: MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      onCloseTab(tabId);
    }
  };

  const getTabIcon = (tab: StudioTab, isActive: boolean) => {
    switch (tab.type) {
      case "table":
        return (
          <TableIcon
            className={cn(
              "w-3.5 h-3.5 shrink-0 transition-colors",
              isActive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300",
            )}
          />
        );
      case "query":
        return (
          <Terminal
            className={cn(
              "w-3.5 h-3.5 shrink-0 transition-colors",
              isActive
                ? "text-blue-600 dark:text-blue-400"
                : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300",
            )}
          />
        );
      case "ddl":
        return (
          <FileCode
            className={cn(
              "w-3.5 h-3.5 shrink-0 transition-colors",
              isActive
                ? "text-purple-600 dark:text-purple-400"
                : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300",
            )}
          />
        );
      case "erd":
        return (
          <Workflow
            className={cn(
              "w-3.5 h-3.5 shrink-0 transition-colors",
              isActive
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300",
            )}
          />
        );
      case "diff":
        return (
          <GitCompare
            className={cn(
              "w-3.5 h-3.5 shrink-0 transition-colors",
              isActive
                ? "text-cyan-600 dark:text-cyan-400"
                : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300",
            )}
          />
        );
      default:
        return null;
    }
  };

  if (tabs.length === 0) {
    return (
      <div
        className="relative z-20 flex items-center justify-between h-9 px-3 bg-zinc-100/80 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800 select-none shrink-0 wails-drag"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono italic select-none pointer-events-none">
          {t("tabs.noTabsOpen")}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onNewQueryTab}
                className="w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 shrink-0 wails-no-drag"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom">{t("tabs.newQueryTab")}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className="relative z-20 flex items-center h-9 px-2 bg-zinc-100/80 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800 select-none overflow-hidden shrink-0 wails-drag"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left Scroll Button when overflowing */}
      {canScrollLeft && (
        <div className="relative z-30 flex items-center shrink-0">
          <div className="absolute left-0 top-0 bottom-0 -ml-2 w-8 bg-linear-to-r from-zinc-100 dark:from-zinc-900 via-zinc-100/90 dark:via-zinc-900/90 to-transparent pointer-events-none" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleScrollBy("left");
                  }}
                  className="w-5 h-6 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 bg-white/95 dark:bg-zinc-800/95 border border-zinc-200 dark:border-zinc-700 shadow-xs cursor-pointer relative z-10 shrink-0 ml-1 wails-no-drag"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {t("tabs.scrollLeft")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Scrollable Tab Strip */}
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden no-scrollbar h-full pt-1 flex-1"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              className={cn(
                "group relative flex items-center gap-2 h-8 px-3 rounded-t-lg font-mono text-xs cursor-pointer transition-all duration-150 border-t-2 max-w-50 shrink-0 select-none wails-no-drag",
                isActive
                  ? "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 border-t-emerald-500 border-x border-zinc-200 dark:border-zinc-800 font-medium shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40 border-t-transparent border-x border-transparent",
              )}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              {getTabIcon(tab, isActive)}

              <span
                className="truncate flex-1 min-w-0 font-medium"
                title={
                  tab.type === "table"
                    ? t("tabs.tableTabTooltip", {
                        name: tab.tableName || tab.title,
                      })
                    : tab.type === "erd"
                      ? t("erd.title")
                      : t("tabs.queryTabTooltip")
                }
              >
                {tab.type === "erd" ? t("erd.title") : tab.title}
              </span>

              {/* Close Button */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      className={cn(
                        "w-4 h-4 rounded flex items-center justify-center transition-opacity shrink-0 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 dark:hover:text-zinc-100 dark:hover:bg-zinc-800",
                        isActive
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  }
                />
                <TooltipContent side="bottom">{t("tabs.close")}</TooltipContent>
              </Tooltip>
            </div>
          );
        })}

        {/* Plus Button to open new Query Tab */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onNewQueryTab}
                className="w-7 h-7 ml-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 shrink-0 cursor-pointer wails-no-drag"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom">{t("tabs.newQueryTab")}</TooltipContent>
        </Tooltip>
      </div>

      {/* Right Scroll Button when overflowing */}
      {canScrollRight && (
        <div className="relative z-30 flex items-center shrink-0">
          <div className="absolute right-0 top-0 bottom-0 -mr-2 w-8 bg-linear-to-l from-zinc-100 dark:from-zinc-900 via-zinc-100/90 dark:via-zinc-900/90 to-transparent pointer-events-none" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleScrollBy("right");
                  }}
                  className="w-5 h-6 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 bg-white/95 dark:bg-zinc-800/95 border border-zinc-200 dark:border-zinc-700 shadow-xs cursor-pointer relative z-10 shrink-0 mr-1 wails-no-drag"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {t("tabs.scrollRight")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Floating Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
          className="fixed z-50 min-w-42.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-lg p-1 font-mono text-xs text-zinc-700 dark:text-zinc-200 animate-in fade-in-50 zoom-in-95 duration-100 wails-no-drag"
        >
          <button
            type="button"
            onClick={() => {
              onCloseTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors"
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
            <span>{t("tabs.close")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCloseOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
            disabled={tabs.length <= 1}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>{t("tabs.closeOthers")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCloseTabsToRight(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
            <span>{t("tabs.closeToRight")}</span>
          </button>

          <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

          <button
            type="button"
            onClick={() => {
              onDuplicateTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors text-emerald-600 dark:text-emerald-400 font-medium"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{t("tabs.duplicate")}</span>
          </button>
        </div>
      )}
    </div>
  );
};
