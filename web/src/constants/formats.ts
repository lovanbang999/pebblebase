import type { ExportFormat } from "@/lib/api";

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  "csv",
  "json",
  "jsonl",
  "xlsx",
  "parquet",
] as const;

export const EXPORT_SIZE_MULTIPLIERS: Record<ExportFormat, number> = {
  parquet: 0.25,
  xlsx: 0.4,
  csv: 0.9,
  jsonl: 1.1,
  json: 1.3,
};

export const ESTIMATED_BYTES_PER_ROW = 120;

export const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Format raw byte numbers into human-readable strings (e.g. "12.5 MB").
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}
