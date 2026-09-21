import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Fragment,
  type FC,
  type MouseEvent,
  type DragEvent,
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
  onReorderTabs?: (sourceIndex: number, destinationIndex: number) => void;
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
  onReorderTabs,
}) => {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
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

  // Auto-scroll when dragging near container boundaries
  const handleDragAutoScroll = useCallback(
    (clientX: number) => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const edgeThreshold = 40;
      if (clientX < rect.left + edgeThreshold) {
        el.scrollLeft -= 8;
        checkScroll();
      } else if (clientX > rect.right - edgeThreshold) {
        el.scrollLeft += 8;
        checkScroll();
      }
    },
    [checkScroll],
  );

  const handleTabDragStart = (
    e: DragEvent<HTMLDivElement>,
    index: number,
    tabId: string,
  ) => {
    setDraggedIndex(index);
    setDropTargetIndex(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tabId);
  };

  const handleTabDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    handleDragAutoScroll(e.clientX);

    const rect = e.currentTarget.getBoundingClientRect();
    const isRightHalf = e.clientX > rect.left + rect.width / 2;
    setDropTargetIndex(isRightHalf ? index + 1 : index);
  };

  const handleContainerDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    handleDragAutoScroll(e.clientX);

    // If dragging over empty area past all tabs, target the end
    setDropTargetIndex(tabs.length);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedIndex !== null && dropTargetIndex !== null && onReorderTabs) {
      let finalDestination = dropTargetIndex;
      if (draggedIndex < finalDestination) {
        finalDestination -= 1;
      }
      if (draggedIndex !== finalDestination) {
        onReorderTabs(draggedIndex, finalDestination);
      }
    }

    setDraggedIndex(null);
    setDropTargetIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  };

  const getTabIcon = (tab: StudioTab, isActive: boolean) => {
    switch (tab.type) {
      case "table":
        return (
          <TableIcon
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors",
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
              "h-3.5 w-3.5 shrink-0 transition-colors",
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
              "h-3.5 w-3.5 shrink-0 transition-colors",
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
              "h-3.5 w-3.5 shrink-0 transition-colors",
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
              "h-3.5 w-3.5 shrink-0 transition-colors",
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
        className="wails-drag relative z-20 flex h-9 shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-100/80 px-3 select-none dark:border-zinc-800 dark:bg-zinc-900/70"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="pointer-events-none font-mono text-xs text-zinc-400 italic select-none dark:text-zinc-500">
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
                className="wails-no-drag h-7 w-7 shrink-0 rounded-md text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <Plus className="h-3.5 w-3.5" />
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
      className="wails-drag relative z-20 flex h-9 shrink-0 items-center overflow-hidden border-b border-zinc-200 bg-zinc-100/80 px-2 select-none dark:border-zinc-800 dark:bg-zinc-900/70"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left Scroll Button when overflowing */}
      {canScrollLeft && (
        <div className="relative z-30 flex shrink-0 items-center">
          <div className="pointer-events-none absolute top-0 bottom-0 left-0 -ml-2 w-8 bg-linear-to-r from-zinc-100 via-zinc-100/90 to-transparent dark:from-zinc-900 dark:via-zinc-900/90" />
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
                  className="wails-no-drag relative z-10 ml-1 h-6 w-5 shrink-0 cursor-pointer rounded border border-zinc-200 bg-white/95 text-zinc-600 shadow-xs hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/95 dark:text-zinc-300 dark:hover:text-zinc-100"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
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
        onDragOver={handleContainerDragOver}
        onDrop={handleDrop}
        className="no-scrollbar flex h-full flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden pt-1"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isDragging = draggedIndex === index;
          const showDropIndicatorBefore =
            draggedIndex !== null &&
            dropTargetIndex === index &&
            dropTargetIndex !== draggedIndex &&
            dropTargetIndex !== draggedIndex + 1;

          return (
            <Fragment key={tab.id}>
              {showDropIndicatorBefore && (
                <div className="animate-in fade-in pointer-events-none z-30 -mx-0.5 h-6 w-0.5 shrink-0 self-center rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] duration-100" />
              )}
              <div
                data-tab-id={tab.id}
                draggable
                onDragStart={(e) => handleTabDragStart(e, index, tab.id)}
                onDragOver={(e) => handleTabDragOver(e, index)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectTab(tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab.id)}
                onMouseDown={(e) => handleMouseDown(e, tab.id)}
                className={cn(
                  "group wails-no-drag relative flex h-8 max-w-50 shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border-t-2 px-3 font-mono text-xs transition-all duration-150 select-none",
                  isActive
                    ? "border-x border-zinc-200 border-t-emerald-500 bg-white font-medium text-zinc-900 shadow-xs dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                    : "border-x border-transparent border-t-transparent text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-100",
                  isDragging &&
                    "scale-[0.98] border-dashed border-zinc-400 opacity-50 dark:border-zinc-600",
                )}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                {getTabIcon(tab, isActive)}

                <span
                  className="min-w-0 flex-1 truncate font-medium"
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
                        draggable={false}
                        onDragStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(tab.id);
                        }}
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-400 transition-opacity hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                          isActive
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    }
                  />
                  <TooltipContent side="bottom">
                    {t("tabs.close")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </Fragment>
          );
        })}

        {/* Drop indicator after the last tab */}
        {draggedIndex !== null &&
          dropTargetIndex === tabs.length &&
          dropTargetIndex !== draggedIndex &&
          dropTargetIndex !== draggedIndex + 1 && (
            <div className="animate-in fade-in pointer-events-none z-30 -mx-0.5 h-6 w-0.5 shrink-0 self-center rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] duration-100" />
          )}

        {/* Plus Button to open new Query Tab */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                draggable={false}
                onDragStart={(e) => e.stopPropagation()}
                onClick={() => onNewQueryTab()}
                className="wails-no-drag ml-1 h-7 w-7 shrink-0 cursor-pointer rounded-md text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom">{t("tabs.newQueryTab")}</TooltipContent>
        </Tooltip>
      </div>

      {/* Right Scroll Button when overflowing */}
      {canScrollRight && (
        <div className="relative z-30 flex shrink-0 items-center">
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 -mr-2 w-8 bg-linear-to-l from-zinc-100 via-zinc-100/90 to-transparent dark:from-zinc-900 dark:via-zinc-900/90" />
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
                  className="wails-no-drag relative z-10 mr-1 h-6 w-5 shrink-0 cursor-pointer rounded border border-zinc-200 bg-white/95 text-zinc-600 shadow-xs hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/95 dark:text-zinc-300 dark:hover:text-zinc-100"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
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
          style={
            {
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }
          className="animate-in fade-in-50 zoom-in-95 wails-no-drag fixed z-50 min-w-42.5 rounded-lg border border-zinc-200 bg-white p-1 font-mono text-xs text-zinc-700 shadow-xl duration-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
        >
          <button
            type="button"
            onClick={() => {
              onCloseTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-3.5 w-3.5 text-zinc-400" />
            <span>{t("tabs.close")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCloseOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
            disabled={tabs.length <= 1}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-zinc-800"
          >
            <Layers className="h-3.5 w-3.5 text-zinc-400" />
            <span>{t("tabs.closeOthers")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCloseTabsToRight(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
            <span>{t("tabs.closeToRight")}</span>
          </button>

          <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />

          <button
            type="button"
            onClick={() => {
              onDuplicateTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-medium text-emerald-600 transition-colors hover:bg-zinc-100 dark:text-emerald-400 dark:hover:bg-zinc-800"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>{t("tabs.duplicate")}</span>
          </button>
        </div>
      )}
    </div>
  );
};
