import type { ComponentType } from "react";
import { FileSpreadsheet, FileJson, FileCode2, Database } from "lucide-react";
import type { ExportFormat } from "@/lib/api";
import type { TableStats, ColumnSchema } from "@/lib/types";
import {
  formatBytes,
  EXPORT_SIZE_MULTIPLIERS,
  ESTIMATED_BYTES_PER_ROW,
} from "@/constants";

export interface ExportFormatOption {
  value: ExportFormat;
  labelKey: string;
  defaultLabel: string;
  desc?: string;
  descKey?: string;
  icon: ComponentType<{ className?: string }>;
  iconClass?: string;
}

export const EXPORT_FORMAT_OPTIONS: readonly ExportFormatOption[] = [
  {
    value: "csv",
    labelKey: "export.format.csv",
    defaultLabel: "CSV (.csv)",
    desc: "Standard comma-separated",
    descKey: "export.formatDesc.csv",
    icon: FileSpreadsheet,
    iconClass: "text-success",
  },
  {
    value: "json",
    labelKey: "export.format.json",
    defaultLabel: "JSON (.json)",
    desc: "Full JSON array",
    descKey: "export.formatDesc.json",
    icon: FileJson,
    iconClass: "text-blue-600 dark:text-blue-400",
  },
  {
    value: "sql",
    labelKey: "export.format.sql",
    defaultLabel: "SQL INSERT (.sql)",
    descKey: "export.formatDesc.sql",
    icon: FileCode2,
    iconClass: "text-primary",
  },
  {
    value: "jsonl",
    labelKey: "export.format.jsonl",
    defaultLabel: "JSONL (.jsonl)",
    desc: "Newline-delimited JSON stream",
    descKey: "export.formatDesc.jsonl",
    icon: FileCode2,
    iconClass: "text-cyan-600 dark:text-cyan-400",
  },
  {
    value: "xlsx",
    labelKey: "export.format.xlsx",
    defaultLabel: "Excel (.xlsx)",
    desc: "Microsoft Excel spreadsheet",
    descKey: "export.formatDesc.xlsx",
    icon: FileSpreadsheet,
    iconClass: "text-green-600 dark:text-green-400",
  },
  {
    value: "parquet",
    labelKey: "export.format.parquet",
    defaultLabel: "Parquet (.parquet)",
    desc: "High-efficiency columnar binary",
    descKey: "export.formatDesc.parquet",
    icon: Database,
    iconClass: "text-primary",
  },
] as const;

export function isCopySupported(format: ExportFormat): boolean {
  return format === "csv" || format === "json" || format === "sql";
}

export function getEstimatedSize(
  format: ExportFormat,
  stats?: TableStats | null,
): string {
  const rawBytes = stats?.size_bytes ?? 0;
  const totalRows = stats?.total_rows ?? 0;

  let baseBytes = rawBytes;
  if (baseBytes <= 0 && totalRows > 0) {
    baseBytes = totalRows * ESTIMATED_BYTES_PER_ROW;
  }
  if (baseBytes <= 0) return "—";

  const estimated = baseBytes * (EXPORT_SIZE_MULTIPLIERS[format] || 1.0);
  return formatBytes(estimated);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Auto-match CSV headers to table columns case-insensitively.
 */
export function matchColumns(
  csvHeaders: string[],
  tableColumns: ColumnSchema[],
): Record<string, string> {
  const initialMappings: Record<string, string> = {};
  const lowerColMap = new Map<string, string>();
  tableColumns.forEach((c) => {
    lowerColMap.set(c.name.toLowerCase(), c.name);
  });

  csvHeaders.forEach((h) => {
    const trimmed = h.trim();
    const matched = lowerColMap.get(trimmed.toLowerCase());
    initialMappings[trimmed] = matched || "";
  });

  return initialMappings;
}

export interface ValidationResult {
  activeMappings: Record<string, string>;
  error: string | null;
}

/**
 * Validate that at least one column is mapped and that no target DB column
 * is mapped from multiple CSV columns.
 */
export function validateColumnMappings(
  columnMappings: Record<string, string>,
): ValidationResult {
  const activeMappings: Record<string, string> = {};
  let mappedCount = 0;

  for (const [csvCol, targetCol] of Object.entries(columnMappings)) {
    if (targetCol && targetCol !== "__skip__") {
      activeMappings[csvCol] = targetCol;
      mappedCount++;
    }
  }

  if (mappedCount === 0) {
    return {
      activeMappings: {},
      error: "datagrid.noColumnsMapped",
    };
  }

  const mappedTargets = Object.values(activeMappings);
  if (new Set(mappedTargets).size !== mappedTargets.length) {
    return {
      activeMappings: {},
      error: "datagrid.eachDbColOneCsvCol",
    };
  }

  return {
    activeMappings,
    error: null,
  };
}
