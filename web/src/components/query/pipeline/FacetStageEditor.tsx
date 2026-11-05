import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FacetStageEditorProps } from "./types";

const FACET_PRESETS: Array<{ label: string; json: string }> = [
  {
    label: "Category Counts + Latest Docs",
    json: JSON.stringify(
      {
        categorizedByStatus: [
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
        latestDocs: [{ $sort: { _id: -1 } }, { $limit: 5 }],
      },
      null,
      2,
    ),
  },
  {
    label: "Price Buckets + Total Count",
    json: JSON.stringify(
      {
        priceDistribution: [
          {
            $bucket: {
              groupBy: "$price",
              boundaries: [0, 50, 100, 250, 500],
              default: "500+",
              output: { count: { $sum: 1 }, avgPrice: { $avg: "$price" } },
            },
          },
        ],
        totalStats: [
          {
            $group: {
              _id: null,
              totalRecords: { $sum: 1 },
              overallAvg: { $avg: "$price" },
            },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    label: "Tags Cloud + User Summary",
    json: JSON.stringify(
      {
        popularTags: [
          { $unwind: "$tags" },
          { $group: { _id: "$tags", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        authorStats: [
          { $group: { _id: "$author", postCount: { $sum: 1 } } },
          { $sort: { postCount: -1 } },
          { $limit: 5 },
        ],
      },
      null,
      2,
    ),
  },
];

export function FacetStageEditor({ config, onChange }: FacetStageEditorProps) {
  const [syntaxError, setSyntaxError] = useState<string | null>(null);

  const handleJsonChange = (val: string) => {
    try {
      JSON.parse(val);
      setSyntaxError(null);
    } catch (err) {
      setSyntaxError(
        err instanceof Error ? err.message : "Invalid JSON syntax",
      );
    }
    onChange({ ...config, rawJson: val });
  };

  const handleApplyPreset = (json: string) => {
    setSyntaxError(null);
    onChange({ ...config, rawJson: json });
  };

  return (
    <div className="flex flex-col gap-2 p-3 font-mono text-xs">
      {/* Preset Templates Bar */}
      <div className="border-border/60 flex flex-wrap items-center gap-1.5 border-b pb-2">
        <span className="text-muted-foreground flex items-center gap-1 text-[10px] font-semibold uppercase">
          <Sparkles className="size-3 text-purple-500" />
          <span>Presets:</span>
        </span>
        {FACET_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => handleApplyPreset(preset.json)}
            className="text-muted-foreground hover:text-foreground h-6 cursor-pointer px-2 text-[10px]"
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Raw JSON Code Area */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-[10px] font-semibold uppercase">
            Multi-Pipeline Facet Definition (JSON)
          </span>
          {syntaxError && (
            <span className="text-destructive font-mono text-[10px]">
              {syntaxError}
            </span>
          )}
        </div>
        <textarea
          rows={7}
          value={config.rawJson}
          onChange={(e) => handleJsonChange(e.target.value)}
          placeholder='{\n  "outputFacet1": [{ "$group": ... }],\n  "outputFacet2": [{ "$sort": ... }]\n}'
          className="border-border bg-background focus:border-primary w-full rounded border p-2 font-mono text-xs leading-5 focus:outline-none"
        />
      </div>
    </div>
  );
}
