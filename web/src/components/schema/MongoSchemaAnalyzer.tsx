import { useState, useEffect, useMemo } from "react";
import {
  RotateCcw,
  Search,
  AlertTriangle,
  FileCode,
  SlidersHorizontal,
  Copy,
  Check,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { BsonBadge } from "@/components/grid/bson/BsonBadge";
import type { BsonType } from "@/components/grid/bson/bsonTypes";
import { fetchMongoSchemaAnalysis } from "@/lib/api";
import type {
  MongoSchemaAnalysisResult,
  MongoFieldAnalysis,
} from "@/lib/types";

interface MongoSchemaAnalyzerProps {
  connId: string;
  tableName: string;
}

export function getBsonBarColor(type: string): string {
  switch (type) {
    case "ObjectId":
      return "bg-amber-500 dark:bg-amber-400";
    case "String":
      return "bg-emerald-500 dark:bg-emerald-400";
    case "Int32":
    case "Int64":
      return "bg-orange-500 dark:bg-orange-400";
    case "Double":
    case "Decimal128":
      return "bg-orange-600 dark:bg-orange-500";
    case "Date":
      return "bg-blue-500 dark:bg-blue-400";
    case "Boolean":
      return "bg-purple-500 dark:bg-purple-400";
    case "Array":
      return "bg-sky-500 dark:bg-sky-400";
    case "Object":
      return "bg-indigo-500 dark:bg-indigo-400";
    case "Binary":
      return "bg-rose-500 dark:bg-rose-400";
    case "Null":
    case "Undefined":
      return "bg-zinc-400 dark:bg-zinc-500";
    default:
      return "bg-muted-foreground/60";
  }
}

export function MongoSchemaAnalyzer({
  connId,
  tableName,
}: MongoSchemaAnalyzerProps) {
  const [sampleSize, setSampleSize] = useState<number>(1000);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MongoSchemaAnalysisResult | null>(
    null,
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadAnalysis = async (size = sampleSize) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchMongoSchemaAnalysis(connId, tableName, size);
      setAnalysis(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to analyze collection schema",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (connId && tableName) {
      loadAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, tableName]);

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedField(path);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const filteredFields = useMemo(() => {
    if (!analysis) return [];
    if (!searchTerm.trim()) return analysis.fields;
    const term = searchTerm.toLowerCase();
    return analysis.fields.filter((f) => f.name.toLowerCase().includes(term));
  }, [analysis, searchTerm]);

  if (isLoading && !analysis) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8">
        <RotateCcw className="text-primary size-6 animate-spin" />
        <span className="text-muted-foreground font-mono text-xs">
          Sampling documents & analyzing schema distributions...
        </span>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="text-destructive size-8" />
        <h3 className="text-foreground font-mono text-sm font-semibold">
          Schema Analysis Error
        </h3>
        <p className="text-muted-foreground max-w-md font-mono text-xs">
          {error}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => loadAnalysis()}
          className="mt-2 cursor-pointer font-mono text-xs"
        >
          <RotateCcw className="mr-1.5 size-3.5" />
          <span>Retry Analysis</span>
        </Button>
      </div>
    );
  }

  if (analysis && analysis.total_sampled === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <EmptyState
          icon={FileCode}
          title="No Documents to Analyze"
          description={`The collection "${tableName}" contains 0 documents. Insert documents or import data to visualize schema distributions.`}
          action={{
            label: "Re-Analyze",
            onClick: () => loadAnalysis(),
            icon: RotateCcw,
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex h-full w-full flex-col overflow-hidden">
      {/* Top Controls & Summary Bar */}
      <div className="border-border bg-card/60 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
        {/* Left: Summary Metrics */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground font-mono text-xs font-semibold">
            Schema Overview:
          </span>
          {analysis && (
            <>
              <Badge
                variant="outline"
                className="font-mono text-[11px] font-normal"
              >
                Sampled:{" "}
                <span className="text-foreground ml-1 font-semibold">
                  {analysis.total_sampled.toLocaleString()}
                </span>
              </Badge>
              <Badge
                variant="outline"
                className="font-mono text-[11px] font-normal"
              >
                Fields:{" "}
                <span className="text-foreground ml-1 font-semibold">
                  {analysis.total_fields}
                </span>
              </Badge>
              <Badge
                variant="outline"
                className="text-muted-foreground font-mono text-[11px] font-normal"
              >
                {analysis.execution_time_ms} ms
              </Badge>
            </>
          )}
        </div>

        {/* Right: Search, Sample Size, and Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Field Search Input */}
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter fields..."
              className="border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:border-primary h-7 w-40 rounded-md border pr-2 pl-7 font-mono text-xs focus:outline-none"
            />
          </div>

          {/* Sample Size Selector */}
          <div className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
            <SlidersHorizontal className="text-muted-foreground size-3" />
            <select
              value={sampleSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setSampleSize(newSize);
                loadAnalysis(newSize);
              }}
              className="border-border bg-background text-foreground focus:border-primary h-7 cursor-pointer rounded border px-2 font-mono text-xs focus:outline-none"
            >
              <option value={100}>100 docs</option>
              <option value={500}>500 docs</option>
              <option value={1000}>1,000 docs</option>
              <option value={2000}>2,000 docs</option>
              <option value={5000}>5,000 docs</option>
            </select>
          </div>

          {/* Re-Analyze Button */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => loadAnalysis()}
            disabled={isLoading}
            className="h-7 cursor-pointer gap-1.5 px-2.5 font-mono text-xs"
          >
            <RotateCcw
              className={cn("size-3.5", isLoading && "animate-spin")}
            />
            <span>Re-Analyze</span>
          </Button>
        </div>
      </div>

      {/* Field Cards Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredFields.length === 0 ? (
          <div className="text-muted-foreground p-8 text-center font-mono text-xs italic">
            No fields matched &quot;{searchTerm}&quot;
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredFields.map((field) => (
              <FieldSchemaCard
                key={field.name}
                field={field}
                onCopyPath={handleCopyPath}
                isCopied={copiedField === field.name}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface FieldSchemaCardProps {
  field: MongoFieldAnalysis;
  onCopyPath: (name: string) => void;
  isCopied: boolean;
}

function FieldSchemaCard({
  field,
  onCopyPath,
  isCopied,
}: FieldSchemaCardProps) {
  return (
    <div className="border-border bg-card/70 hover:border-primary/40 rounded-lg border p-3 shadow-2xs transition-colors">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Field Name & Copy Path */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-foreground truncate font-mono text-xs font-semibold select-all">
            {field.name}
          </span>
          <button
            type="button"
            onClick={() => onCopyPath(field.name)}
            title="Copy field path"
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-0.5 transition-colors"
          >
            {isCopied ? (
              <Check className="text-success size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        </div>

        {/* Presence & Diagnostic Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Polymorphic Mixed Types Warning */}
          {field.is_polymorphic && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/40 bg-amber-500/10 py-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="size-3" />
              <span>Mixed types ({field.types.length})</span>
            </Badge>
          )}

          {/* High Missing Rate Warning */}
          {field.missing_rate > 30 && (
            <Badge
              variant="outline"
              className="gap-1 border-rose-500/40 bg-rose-500/10 py-0.5 font-mono text-[10px] text-rose-600 dark:text-rose-400"
            >
              <Info className="size-3" />
              <span>Missing in {field.missing_rate}%</span>
            </Badge>
          )}

          {/* Frequency Badge */}
          <Badge
            variant={field.frequency === 100 ? "default" : "secondary"}
            className={cn(
              "py-0.5 font-mono text-[10px]",
              field.frequency === 100
                ? "bg-primary/90 text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {field.frequency === 100
              ? "100% presence"
              : `${field.frequency}% presence (${field.count} docs)`}
          </Badge>
        </div>
      </div>

      {/* Stacked Horizontal Progress Bar */}
      <div className="mt-2.5">
        <div className="bg-muted/70 ring-border/50 flex h-3 w-full overflow-hidden rounded-md ring-1">
          {field.types.map((typeDist) => (
            <div
              key={typeDist.type}
              style={{ width: `${typeDist.percentage}%` }}
              title={`${typeDist.type}: ${typeDist.percentage}% (${typeDist.count} occurrences)`}
              className={cn(
                "h-full transition-all duration-300",
                getBsonBarColor(typeDist.type),
              )}
            />
          ))}
        </div>
      </div>

      {/* Type Breakdown Labels Below Progress Bar */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {field.types.map((typeDist) => (
          <div key={typeDist.type} className="flex items-center gap-1">
            <BsonBadge type={typeDist.type as BsonType} />
            <span className="text-muted-foreground font-mono text-[10px]">
              {typeDist.percentage}% ({typeDist.count})
            </span>
          </div>
        ))}
      </div>

      {/* Numeric, Date, String Statistics & Sample Previews */}
      <FieldStatsSummary stats={field.stats} />
    </div>
  );
}

function FieldStatsSummary({ stats }: { stats: MongoFieldAnalysis["stats"] }) {
  const hasNumeric = stats.min !== undefined && stats.max !== undefined;
  const hasStringLengths =
    stats.min_length !== undefined && stats.max_length !== undefined;
  const hasSamples =
    stats.distinct_samples && stats.distinct_samples.length > 0;

  if (!hasNumeric && !hasStringLengths && !hasSamples) {
    return null;
  }

  return (
    <div className="border-border/40 text-muted-foreground mt-2.5 flex flex-wrap items-center gap-3 border-t pt-2 font-mono text-[11px]">
      {/* Numeric Stats */}
      {hasNumeric && stats.avg !== undefined && (
        <div className="flex items-center gap-2">
          <span>
            Min:{" "}
            <span className="text-foreground font-semibold">
              {String(stats.min)}
            </span>
          </span>
          <span>
            Max:{" "}
            <span className="text-foreground font-semibold">
              {String(stats.max)}
            </span>
          </span>
          <span>
            Avg:{" "}
            <span className="text-foreground font-semibold">{stats.avg}</span>
          </span>
        </div>
      )}

      {/* Date Stats */}
      {hasNumeric &&
        stats.avg === undefined &&
        typeof stats.min === "string" && (
          <div className="flex items-center gap-2">
            <span>
              Earliest:{" "}
              <span className="text-foreground">{String(stats.min)}</span>
            </span>
            <span>
              Latest:{" "}
              <span className="text-foreground">{String(stats.max)}</span>
            </span>
          </div>
        )}

      {/* String Length Stats */}
      {hasStringLengths && (
        <div className="flex items-center gap-2">
          <span>
            Len min:{" "}
            <span className="text-foreground font-semibold">
              {stats.min_length}
            </span>
          </span>
          <span>
            Max:{" "}
            <span className="text-foreground font-semibold">
              {stats.max_length}
            </span>
          </span>
          <span>
            Avg:{" "}
            <span className="text-foreground font-semibold">
              {stats.avg_length}
            </span>
          </span>
        </div>
      )}

      {/* Distinct Samples Preview */}
      {hasSamples && (
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-muted-foreground text-[10px]">Samples:</span>
          {stats.distinct_samples!.slice(0, 4).map((sample, idx) => (
            <span
              key={idx}
              className="bg-muted/60 py-0.2 text-foreground border-border/40 max-w-[140px] truncate rounded border px-1 text-[10px]"
              title={String(sample)}
            >
              {typeof sample === "object"
                ? JSON.stringify(sample)
                : String(sample)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
