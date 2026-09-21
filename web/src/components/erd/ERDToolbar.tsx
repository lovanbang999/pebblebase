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
    <div className="erd-toolbar absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-xl backdrop-blur-md select-none dark:border-white/10 dark:bg-[#13141f]/90">
      {/* Table Search Input */}
      <div className="relative flex max-w-60 min-w-45 items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("erd.search")}
          className="h-8 border-zinc-200 bg-zinc-100/80 pr-7 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-indigo-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
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
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 dark:bg-white/5">
          {matchedTables}/{totalTables}
        </span>
      )}

      <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-white/10" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onZoomIn}
                className="h-7 w-7 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
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
                className="h-7 w-7 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
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
                className="h-7 w-7 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
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
                  className="h-7 w-7 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-indigo-400" />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {t("erd.autoArrange")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-white/10" />

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
                  ? "border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10",
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
              className="h-7 gap-1 px-2 font-mono text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              {direction === "LR" ? (
                <>
                  <ArrowRight className="h-3 w-3 text-indigo-500" />
                  <span>LR</span>
                </>
              ) : (
                <>
                  <ArrowDown className="h-3 w-3 text-indigo-500" />
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
                  ? "border border-indigo-500/30 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10",
              )}
            >
              <Map className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <TooltipContent side="bottom">{t("erd.minimap")}</TooltipContent>
      </Tooltip>

      <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-white/10" />

      {/* Copy Mermaid ERD Button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyMermaid}
              className="h-7 gap-1.5 px-2 font-mono text-xs text-zinc-600 transition-all hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              {isMermaidCopied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">
                    {t("erd.mermaidCopied")}
                  </span>
                </>
              ) : (
                <>
                  <Code2 className="h-3 w-3 text-indigo-400" />
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
          "h-7 cursor-pointer gap-1.5 rounded-lg px-2.5 text-xs font-medium shadow-xs transition-colors",
          "bg-indigo-600 text-white hover:bg-indigo-500 hover:text-white active:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:active:bg-indigo-700",
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
