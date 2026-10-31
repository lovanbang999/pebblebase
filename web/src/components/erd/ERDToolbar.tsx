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
    <div className="erd-toolbar border-border/90 bg-background/95 dark:border-border dark:bg-card/95 absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 rounded-lg border p-1 shadow-xs backdrop-blur-md select-none">
      {/* Table Search Input */}
      <div className="relative flex max-w-60 min-w-45 items-center">
        <Search className="text-muted-foreground pointer-events-none absolute left-2.5 h-3.5 w-3.5" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("erd.search")}
          className="border-border bg-muted/70 text-foreground placeholder:text-muted-foreground dark:border-border dark:bg-muted/60 dark:text-foreground h-7 pr-7 pl-8 text-xs focus-visible:ring-1 focus-visible:ring-blue-500/60"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground absolute right-2 p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {searchQuery && (
        <span className="bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
          {matchedTables}/{totalTables}
        </span>
      )}

      <div className="bg-muted dark:bg-muted mx-0.5 h-4 w-px" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onZoomIn}
                className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted h-7 w-7"
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
                className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted h-7 w-7"
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
                className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted h-7 w-7"
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
                  className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted h-7 w-7"
                >
                  <LayoutGrid className="text-muted-foreground dark:text-muted-foreground h-3.5 w-3.5" />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {t("erd.autoArrange")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="bg-muted dark:bg-muted mx-0.5 h-4 w-px" />

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
                  ? "border-warning/80 bg-warning/10 text-warning dark:border-warning/60 dark:bg-warning/40 dark:text-warning border"
                  : "text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted",
              )}
            >
              <Key className="text-warning h-3 w-3" />
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
              className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted h-7 gap-1 px-2 font-mono text-xs"
            >
              {direction === "LR" ? (
                <>
                  <ArrowRight className="text-muted-foreground dark:text-muted-foreground h-3 w-3" />
                  <span>LR</span>
                </>
              ) : (
                <>
                  <ArrowDown className="text-muted-foreground dark:text-muted-foreground h-3 w-3" />
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
                  : "text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted",
              )}
            >
              <Map className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <TooltipContent side="bottom">{t("erd.minimap")}</TooltipContent>
      </Tooltip>

      <div className="bg-muted dark:bg-muted mx-0.5 h-4 w-px" />

      {/* Copy Mermaid ERD Button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyMermaid}
              className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted h-7 gap-1.5 px-2 font-mono text-xs transition-all"
            >
              {isMermaidCopied ? (
                <>
                  <Check className="text-success dark:text-success h-3 w-3" />
                  <span className="text-success dark:text-success">
                    {t("erd.mermaidCopied")}
                  </span>
                </>
              ) : (
                <>
                  <Code2 className="text-muted-foreground dark:text-muted-foreground h-3 w-3" />
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
