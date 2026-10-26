/**
 * Pebblebase Cell Content Type Detector
 * Identifies whether a cell's string content is JSON, HTML, Markdown, or Plain Text.
 * Also measures payload size and flags oversized content (>500KB) for performance guard.
 */

export type CellContentType = "json" | "html" | "markdown" | "text";

export interface CellContentAnalysis {
  type: CellContentType;
  rawString: string;
  byteSize: number;
  charCount: number;
  formattedSize: string;
  isLargePayload: boolean;
  parsedJson?: unknown;
  jsonParseError?: string;
}

export const LARGE_PAYLOAD_THRESHOLD_BYTES = 500 * 1024; // 500 KB

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Analyzes cell value and returns structural categorization
 */
export function analyzeCellContent(value: unknown): CellContentAnalysis {
  let rawString = "";
  let parsedJson: unknown = undefined;
  let jsonParseError: string | undefined = undefined;

  if (value === null || value === undefined) {
    rawString = "";
  } else if (typeof value === "object") {
    try {
      rawString = JSON.stringify(value, null, 2);
      parsedJson = value;
    } catch (e: any) {
      rawString = String(value);
      jsonParseError = e?.message ?? "JSON serialization failed";
    }
  } else {
    rawString = String(value);
  }

  const charCount = rawString.length;
  // Calculate approximate byte size using Blob or UTF-8 encoder
  const byteSize = new Blob([rawString]).size;
  const isLargePayload = byteSize > LARGE_PAYLOAD_THRESHOLD_BYTES;

  // 1. Check for JSON if not already an object
  if (parsedJson === undefined && rawString.trim().length > 1) {
    const trimmed = rawString.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      // If oversized, skip auto JSON parse unless user explicitly requests
      if (!isLargePayload) {
        try {
          parsedJson = JSON.parse(trimmed);
        } catch (e: any) {
          jsonParseError = e?.message ?? "Invalid JSON syntax";
        }
      }
    }
  }

  // Determine Type
  let detectedType: CellContentType = "text";

  if (parsedJson !== undefined) {
    detectedType = "json";
  } else {
    const trimmed = rawString.trim();

    // 2. Check for HTML
    const htmlTagPattern =
      /<([a-z0-9]+)(\s+[^>]*>|>)([\s\S]*?)<\/\1>|<([a-z0-9]+)\s*\/?>/i;
    const isLikelyHtml =
      (trimmed.startsWith("<!DOCTYPE") ||
        trimmed.startsWith("<html") ||
        trimmed.startsWith("<div") ||
        trimmed.startsWith("<p") ||
        trimmed.startsWith("<span") ||
        trimmed.startsWith("<table") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<header") ||
        trimmed.startsWith("<section") ||
        trimmed.startsWith("<article")) &&
      htmlTagPattern.test(trimmed);

    if (isLikelyHtml) {
      detectedType = "html";
    } else {
      // 3. Check for Markdown
      const hasMarkdownHeading = /^#{1,6}\s+\S+/m.test(trimmed);
      const hasMarkdownCodeBlock = /```[\s\S]*?```/.test(trimmed);
      const hasMarkdownTable = /\|.+\|\s*\n\|[-:\s|]+\|\s*\n\|.+\|/.test(
        trimmed,
      );
      const hasMarkdownList = /^(\s*[-*+]|\s*\d+\.)\s+\S+/m.test(trimmed);
      const hasMarkdownBoldOrLink =
        /\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\)/.test(trimmed);

      const markdownSignals = [
        hasMarkdownHeading,
        hasMarkdownCodeBlock,
        hasMarkdownTable,
        hasMarkdownList,
        hasMarkdownBoldOrLink,
      ].filter(Boolean).length;

      if (
        markdownSignals >= 2 ||
        (hasMarkdownCodeBlock && markdownSignals >= 1) ||
        hasMarkdownTable
      ) {
        detectedType = "markdown";
      } else {
        detectedType = "text";
      }
    }
  }

  return {
    type: detectedType,
    rawString,
    byteSize,
    charCount,
    formattedSize: formatByteSize(byteSize),
    isLargePayload,
    parsedJson,
    jsonParseError,
  };
}
