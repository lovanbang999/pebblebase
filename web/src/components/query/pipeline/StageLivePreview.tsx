import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  RotateCcw,
  AlertTriangle,
  Clock,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchPipelinePreview } from "@/lib/api";
import type { PipelinePreviewResult } from "@/lib/types";

interface StageLivePreviewProps {
  connId?: string;
  collection?: string;
  activeStagesUpToThis?: Record<string, unknown>[];
  isStageEnabled: boolean;
}

export function StageLivePreview({
  connId,
  collection,
  activeStagesUpToThis = [],
  isStageEnabled,
}: StageLivePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelinePreviewResult | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executePreview = async () => {
    if (!connId || !collection || !isStageEnabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchPipelinePreview(
        connId,
        collection,
        activeStagesUpToThis,
        10,
      );
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to preview intermediate stage results",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced execution when expanded and stages change
  useEffect(() => {
    if (!isExpanded || !isStageEnabled) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executePreview();
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, isStageEnabled, JSON.stringify(activeStagesUpToThis)]);

  const handleToggleExpand = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && !result) {
      executePreview();
    }
  };

  return (
    <div className="border-border/60 bg-muted/20 border-t font-mono text-xs">
      {/* Accordion Toggle Bar */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <button
          type="button"
          onClick={handleToggleExpand}
          className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-[11px] font-medium transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="text-primary size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
          <Eye className="text-primary/80 size-3" />
          <span>Stage Preview (10 documents)</span>
        </button>

        {isExpanded && result && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-muted-foreground h-5 gap-1 text-[10px] font-normal"
            >
              <Clock className="size-2.5" />
              <span>{result.execution_time_ms} ms</span>
            </Badge>
            <Badge
              variant="outline"
              className="text-muted-foreground h-5 gap-1 text-[10px] font-normal"
            >
              <Layers className="size-2.5" />
              <span>{result.count} docs</span>
            </Badge>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={executePreview}
              disabled={isLoading}
              title="Refresh intermediate preview"
              className="text-muted-foreground hover:text-foreground h-5 w-5 cursor-pointer"
            >
              <RotateCcw
                className={cn("size-3", isLoading && "animate-spin")}
              />
            </Button>
          </div>
        )}
      </div>

      {/* Expanded Preview Drawer */}
      {isExpanded && (
        <div className="px-3 pt-1 pb-3">
          {/* Loading Indicator */}
          {isLoading && (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-[11px] italic">
              <RotateCcw className="text-primary size-3.5 animate-spin" />
              <span>Sampling intermediate documents...</span>
            </div>
          )}

          {/* Local Error Card */}
          {error && !isLoading && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded border p-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-semibold">
                  Stage Preview Error
                </span>
                <span className="text-[11px] leading-relaxed break-all">
                  {error}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={executePreview}
                  className="border-destructive/40 text-destructive hover:bg-destructive/20 mt-1 h-6 w-fit cursor-pointer text-[10px]"
                >
                  <RotateCcw className="mr-1 size-2.5" />
                  <span>Retry Stage</span>
                </Button>
              </div>
            </div>
          )}

          {/* Documents Result View */}
          {!isLoading && !error && result && (
            <div className="flex flex-col gap-2">
              {result.documents.length === 0 ? (
                <div className="text-muted-foreground py-3 text-center text-[11px] italic">
                  0 documents produced by this stage
                </div>
              ) : (
                <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1">
                  {result.documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="border-border/70 bg-card overflow-hidden rounded border p-2 text-[11px] shadow-2xs"
                    >
                      <div className="border-border/40 text-muted-foreground mb-1 flex items-center justify-between border-b pb-1 text-[10px]">
                        <span className="text-primary font-semibold">
                          #{idx + 1}
                        </span>
                        {doc._id !== undefined && (
                          <span className="max-w-50 truncate">
                            _id: {String(doc._id)}
                          </span>
                        )}
                      </div>
                      <pre className="text-foreground/90 max-h-36 overflow-auto font-mono text-[10px] leading-4 break-all whitespace-pre-wrap">
                        {JSON.stringify(doc, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
