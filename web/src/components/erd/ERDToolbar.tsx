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
    <div className="erd-toolbar absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-white/90 dark:bg-[#13141f]/90 backdrop-blur-md border border-zinc-200/80 dark:border-white/10 shadow-xl select-none">
      {/* Table Search Input */}
      <div className="relative flex items-center min-w-45 max-w-60">
        <Search className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("erd.search")}
          className="h-8 pl-8 pr-7 text-xs bg-zinc-100/80 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-indigo-500/60"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
      </div>

      {searchQuery && (
        <span className="text-[10px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/5">
          {matchedTables}/{totalTables}
        </span>
      )}

      <div className="h-4 w-px bg-zinc-200 dark:bg-white/10 mx-0.5" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onZoomIn}
                className="w-7 h-7 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                <ZoomIn className="w-3.5 h-3.5" />
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
                className="w-7 h-7 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                <ZoomOut className="w-3.5 h-3.5" />
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
                className="w-7 h-7 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                <Maximize2 className="w-3.5 h-3.5" />
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
                  className="w-7 h-7 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {t("erd.autoArrange")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="h-4 w-px bg-zinc-200 dark:bg-white/10 mx-0.5" />

      {/* Compact Mode Toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCompactMode}
              className={cn(
                "h-7 px-2 text-xs font-mono gap-1 transition-colors",
                compactMode
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10",
              )}
            >
              <Key className="w-3 h-3 text-amber-500" />
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
              className="h-7 px-2 text-xs font-mono gap-1 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              {direction === "LR" ? (
                <>
                  <ArrowRight className="w-3 h-3 text-indigo-500" />
                  <span>LR</span>
                </>
              ) : (
                <>
                  <ArrowDown className="w-3 h-3 text-indigo-500" />
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
                "w-7 h-7 transition-colors",
                showMinimap
                  ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10",
              )}
            >
              <Map className="w-3.5 h-3.5" />
            </Button>
          }
        />
        <TooltipContent side="bottom">{t("erd.minimap")}</TooltipContent>
      </Tooltip>

      <div className="h-4 w-px bg-zinc-200 dark:bg-white/10 mx-0.5" />

      {/* Copy Mermaid ERD Button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyMermaid}
              className="h-7 px-2 text-xs gap-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all font-mono"
            >
              {isMermaidCopied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">
                    {t("erd.mermaidCopied")}
                  </span>
                </>
              ) : (
                <>
                  <Code2 className="w-3 h-3 text-indigo-400" />
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
          "h-7 px-2.5 text-xs gap-1.5 font-medium rounded-lg shadow-xs transition-colors cursor-pointer",
          "bg-indigo-600 text-white hover:bg-indigo-500 hover:text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 active:bg-indigo-700 dark:active:bg-indigo-700",
          isExporting && "opacity-75 cursor-wait",
        )}
      >
        {isExporting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
        ) : (
          <Download className="w-3.5 h-3.5 text-white" />
        )}
        <span className="font-semibold text-white">
          {isExporting ? t("erd.exporting") : t("erd.exportPng")}
        </span>
      </Button>
    </div>
  );
}
