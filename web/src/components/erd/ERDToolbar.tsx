import { useTranslation } from "react-i18next";
import {
  Search,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Map,
  Download,
  Loader2,
  ArrowRight,
  ArrowDown,
  Key,
  Code2,
  Check,
  LayoutGrid,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "cn";

interface ERDToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalTables: number;
  matchedTables: number;
  direction: "LR" | "TB";
  onToggleDirection: () => void;
  compactMode: boolean;
  onToggleCompactMode: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetLayout?: () => void;
  onExportPng: () => void;
  isExporting: boolean;
  onCopyMermaid: () => void;
  isMermaidCopied: boolean;
}

export default function ERDToolbar({
  searchQuery,
  onSearchChange,
  totalTables,
  matchedTables,
  direction,
  onToggleDirection,
  compactMode,
  onToggleCompactMode,
  showMinimap,
  onToggleMinimap,
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetLayout,
  onExportPng,
  isExporting,
  onCopyMermaid,
  isMermaidCopied,
}: ERDToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="erd-toolbar absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200/90 bg-white/95 p-1 shadow-xs backdrop-blur-md select-none dark:border-zinc-800 dark:bg-zinc-900/95">
      {/* Table Search Input */}
      <div className="relative flex max-w-60 min-w-45 items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("erd.search")}
          className="h-7 border-zinc-200 bg-zinc-100/70 pr-7 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-blue-500/60 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {searchQuery && (
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {matchedTables}/{totalTables}
        </span>
      )}

      <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onZoomIn}
                className="h-7 w-7 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom">{t("erd.zoomIn")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onZoomOut}
                className="h-7 w-7 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom">{t("erd.zoomOut")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onFitView}
                className="h-7 w-7 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom">{t("erd.fitView")}</TooltipContent>
        </Tooltip>

        {onResetLayout && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onResetLayout}
                  className="h-7 w-7 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {t("erd.autoArrange")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

      {/* Compact Mode Toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCompactMode}
              className={cn(
                "h-7 gap-1 px-2 font-mono text-xs transition-colors",
                compactMode
                  ? "border border-amber-300/80 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
              )}
            >
              <Key className="h-3 w-3 text-amber-500" />
              <span className="text-[11px]">
                {compactMode ? t("erd.keysOnly") : t("erd.allCols")}
              </span>
            </Button>
          }
        />
        <TooltipContent side="bottom">{t("erd.compactMode")}</TooltipContent>
      </Tooltip>

      {/* Layout Direction Toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleDirection}
              className="h-7 gap-1 px-2 font-mono text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {direction === "LR" ? (
                <>
                  <ArrowRight className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
                  <span>LR</span>
                </>
              ) : (
                <>
                  <ArrowDown className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
                  <span>TB</span>
                </>
              )}
            </Button>
          }
        />
        <TooltipContent side="bottom">{t("erd.layout")}</TooltipContent>
      </Tooltip>

      {/* Minimap Toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggleMinimap}
              className={cn(
                "h-7 w-7 transition-colors",
                showMinimap
                  ? "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
              )}
            >
              <Map className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <TooltipContent side="bottom">{t("erd.minimap")}</TooltipContent>
      </Tooltip>

      <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

      {/* Copy Mermaid ERD Button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyMermaid}
              className="h-7 gap-1.5 px-2 font-mono text-xs text-zinc-600 transition-all hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isMermaidCopied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {t("erd.mermaidCopied")}
                  </span>
                </>
              ) : (
                <>
                  <Code2 className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
                  <span>Mermaid</span>
                </>
              )}
            </Button>
          }
        />
        <TooltipContent side="bottom">{t("erd.copyMermaid")}</TooltipContent>
      </Tooltip>

      {/* Export PNG Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onExportPng}
        disabled={isExporting}
        className={cn(
          "h-7 cursor-pointer gap-1.5 rounded-md px-2.5 text-xs font-medium shadow-2xs transition-colors",
          "bg-blue-600 text-white hover:bg-blue-500 hover:text-white active:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 dark:active:bg-blue-700",
          isExporting && "cursor-wait opacity-75",
        )}
      >
        {isExporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
        ) : (
          <Download className="h-3.5 w-3.5 text-white" />
        )}
        <span className="font-semibold text-white">
          {isExporting ? t("erd.exporting") : t("erd.exportPng")}
        </span>
      </Button>
    </div>
  );
}
