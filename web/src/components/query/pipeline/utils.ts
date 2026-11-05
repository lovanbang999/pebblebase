import type { RawQueryResult } from "@/lib/types";
import type { StageType, StageConfig } from "./types";

// --------------------------------------------------------------------------
// Helper: Smart Parse Value
// --------------------------------------------------------------------------
export function parseSmartValue(val: string): unknown {
  const trimmed = val.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (!isNaN(Number(trimmed)) && !trimmed.startsWith("0x")) {
    return Number(trimmed);
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

// --------------------------------------------------------------------------
// Stage Defaults Creator
// --------------------------------------------------------------------------
export function createDefaultStage(type: StageType): StageConfig {
  const idGen = () => Math.random().toString(36).substring(2, 9);
  switch (type) {
    case "$match":
      return {
        type: "$match",
        config: {
          mode: "visual",
          rules: [
            { id: idGen(), field: "status", operator: "$eq", value: "active" },
          ],
          rawJson: '{\n  "status": "active"\n}',
        },
      };
    case "$group":
      return {
        type: "$group",
        config: {
          mode: "visual",
          groupByField: "$country",
          accumulators: [
            {
              id: idGen(),
              outputField: "count",
              operator: "$sum",
              expression: "1",
            },
          ],
          rawJson: '{\n  "_id": "$country",\n  "count": { "$sum": 1 }\n}',
        },
      };
    case "$sort":
      return {
        type: "$sort",
        config: {
          mode: "visual",
          fields: [{ id: idGen(), field: "count", direction: -1 }],
          rawJson: '{\n  "count": -1\n}',
        },
      };
    case "$limit":
      return {
        type: "$limit",
        config: { limit: 50 },
      };
    case "$project":
      return {
        type: "$project",
        config: {
          mode: "visual",
          fields: [
            { id: idGen(), field: "_id", mode: "include" },
            { id: idGen(), field: "name", mode: "include" },
          ],
          rawJson: '{\n  "_id": 1,\n  "name": 1\n}',
        },
      };
    case "$lookup":
      return {
        type: "$lookup",
        config: {
          from: "",
          localField: "_id",
          foreignField: "userId",
          as: "joinedData",
        },
      };
    case "$unwind":
      return {
        type: "$unwind",
        config: {
          path: "$tags",
          preserveNullAndEmptyArrays: false,
        },
      };
    case "$facet":
      return {
        type: "$facet",
        config: {
          mode: "raw",
          rawJson: JSON.stringify(
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
      };
  }
}

// --------------------------------------------------------------------------
// Generate Stage Object
// --------------------------------------------------------------------------
export function generateStageObject(
  stageConfig: StageConfig,
): Record<string, unknown> | null {
  switch (stageConfig.type) {
    case "$match": {
      const { mode, rules, rawJson } = stageConfig.config;
      if (mode === "raw") {
        try {
          return { $match: JSON.parse(rawJson) };
        } catch {
          return null;
        }
      }
      const matchObj: Record<string, unknown> = {};
      for (const rule of rules) {
        const field = rule.field.trim();
        if (!field) continue;
        const parsed = parseSmartValue(rule.value);
        if (rule.operator === "$eq") {
          matchObj[field] = parsed;
        } else if (rule.operator === "$in") {
          if (Array.isArray(parsed)) {
            matchObj[field] = { $in: parsed };
          } else if (typeof parsed === "string") {
            matchObj[field] = {
              $in: parsed.split(",").map((s) => parseSmartValue(s.trim())),
            };
          } else {
            matchObj[field] = { $in: [parsed] };
          }
        } else {
          matchObj[field] = { [rule.operator]: parsed };
        }
      }
      return { $match: matchObj };
    }

    case "$group": {
      const { mode, groupByField, accumulators, rawJson } = stageConfig.config;
      if (mode === "raw") {
        try {
          return { $group: JSON.parse(rawJson) };
        } catch {
          return null;
        }
      }
      const groupObj: Record<string, unknown> = {};
      const trimmedGroup = groupByField.trim();
      if (!trimmedGroup || trimmedGroup === "null") {
        groupObj["_id"] = null;
      } else if (trimmedGroup.startsWith("{")) {
        try {
          groupObj["_id"] = JSON.parse(trimmedGroup);
        } catch {
          groupObj["_id"] = trimmedGroup;
        }
      } else if (trimmedGroup.startsWith("$")) {
        groupObj["_id"] = trimmedGroup;
      } else {
        groupObj["_id"] = "$" + trimmedGroup;
      }

      for (const acc of accumulators) {
        const outField = acc.outputField.trim();
        if (!outField) continue;
        const parsedExpr = parseSmartValue(acc.expression);
        groupObj[outField] = { [acc.operator]: parsedExpr };
      }
      return { $group: groupObj };
    }

    case "$sort": {
      const { mode, fields, rawJson } = stageConfig.config;
      if (mode === "raw") {
        try {
          return { $sort: JSON.parse(rawJson) };
        } catch {
          return null;
        }
      }
      const sortObj: Record<string, number> = {};
      for (const f of fields) {
        const fieldName = f.field.trim();
        if (fieldName) {
          sortObj[fieldName] = f.direction;
        }
      }
      return { $sort: sortObj };
    }

    case "$limit": {
      const num = Number(stageConfig.config.limit);
      return { $limit: isNaN(num) || num <= 0 ? 50 : Math.floor(num) };
    }

    case "$project": {
      const { mode, fields, rawJson } = stageConfig.config;
      if (mode === "raw") {
        try {
          return { $project: JSON.parse(rawJson) };
        } catch {
          return null;
        }
      }
      const projObj: Record<string, unknown> = {};
      for (const f of fields) {
        const fieldName = f.field.trim();
        if (!fieldName) continue;
        if (f.mode === "include") {
          projObj[fieldName] = 1;
        } else if (f.mode === "exclude") {
          projObj[fieldName] = 0;
        } else {
          projObj[fieldName] = parseSmartValue(f.expression || "");
        }
      }
      return { $project: projObj };
    }

    case "$lookup": {
      const { from, localField, foreignField, as } = stageConfig.config;
      return {
        $lookup: {
          from: from.trim(),
          localField: localField.trim(),
          foreignField: foreignField.trim(),
          as: as.trim() || "joinedData",
        },
      };
    }

    case "$unwind": {
      const { path, preserveNullAndEmptyArrays } = stageConfig.config;
      const cleanPath = path.trim();
      const formattedPath = cleanPath.startsWith("$")
        ? cleanPath
        : "$" + cleanPath;
      if (preserveNullAndEmptyArrays) {
        return {
          $unwind: {
            path: formattedPath,
            preserveNullAndEmptyArrays: true,
          },
        };
      }
      return { $unwind: formattedPath };
    }

    case "$facet": {
      const { rawJson } = stageConfig.config;
      try {
        return { $facet: JSON.parse(rawJson) };
      } catch {
        return null;
      }
    }
  }
}

// --------------------------------------------------------------------------
// Stage Badge Style
// --------------------------------------------------------------------------
export function getStageBadgeStyle(type: StageType): string {
  switch (type) {
    case "$match":
      return "bg-warning/10 text-warning dark:text-warning border-warning/30";
    case "$group":
      return "bg-success/10 text-success dark:text-success border-primary/30";
    case "$sort":
      return "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30";
    case "$limit":
      return "bg-primary/10 text-primary dark:text-primary border-primary/30";
    case "$project":
      return "bg-primary/10 text-primary dark:text-primary border-primary/30";
    case "$lookup":
      return "bg-destructive/10 text-destructive dark:text-destructive border-destructive/30";
    case "$unwind":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30";
    case "$facet":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30";
  }
}

// --------------------------------------------------------------------------
// CSV Exporter
// --------------------------------------------------------------------------
export function exportPipelineCSV(
  results: RawQueryResult,
  collection: string,
): void {
  if (!results || !results.rows || results.rows.length === 0) return;
  const cols = results.columns;
  const headerRow = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
  const bodyRows = results.rows.map((row) =>
    cols
      .map((c) => {
        const val = row[c];
        if (val === null || val === undefined) return "";
        const str = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(","),
  );
  const csvContent = [headerRow, ...bodyRows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `pipeline_${collection || "results"}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
