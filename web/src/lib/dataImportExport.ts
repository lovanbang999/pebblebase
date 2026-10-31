import type { ExportFormat } from "@/lib/api";

export interface CSVPreview {
  headers: string[];
  rows: string[][];
  errors: string[];
  rowCount: number;
}

export function parseCSVPreview(text: string, maxRows = 5): CSVPreview {
  const preview: string[][] = [];
  const errors: string[] = [];
  let headers: string[] = [];
  let rowCount = 0;
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;
  let line = 1;
  const addError = (message: string) => {
    if (errors.length < 50) errors.push(message);
  };

  const finishRow = () => {
    fields.push(field.trim());
    field = "";
    closedQuote = false;
    if (fields.length === 1 && fields[0] === "") {
      fields = [];
      return;
    }
    if (headers.length === 0) {
      headers = fields.map((header) => header.trim());
      if (headers.some((header) => !header))
        addError("Header row contains an empty column name.");
      if (new Set(headers).size !== headers.length)
        addError("Header row contains duplicate column names.");
    } else {
      rowCount++;
      if (fields.length !== headers.length) {
        addError(
          `Row ${line} has ${fields.length} columns; expected ${headers.length}.`,
        );
      }
      if (preview.length < maxRows) preview.push(fields);
    }
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (inQuotes && char === '"') {
      if (nextChar === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
        closedQuote = true;
      }
    } else if (
      !inQuotes &&
      char === '"' &&
      field.length === 0 &&
      !closedQuote
    ) {
      inQuotes = true;
    } else if (!inQuotes && char === '"') {
      addError(`Unexpected quote in an unquoted field on row ${line}.`);
      field += char;
    } else if (!inQuotes && char === ",") {
      fields.push(field);
      field = "";
      closedQuote = false;
    } else if (!inQuotes && (char === "\r" || char === "\n")) {
      if (char === "\r" && nextChar === "\n") i++;
      finishRow();
      line++;
    } else if (closedQuote && char !== " " && char !== "\t") {
      addError(`Unexpected character after a closing quote on row ${line}.`);
      field += char;
      closedQuote = false;
    } else {
      field += char;
    }
  }

  if (inQuotes) addError(`Unclosed quoted field on row ${line}.`);
  if (field.length > 0 || fields.length > 0) finishRow();
  return { headers, rows: preview, errors: [...new Set(errors)], rowCount };
}

export function cleanExportRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith("_pb_")),
  );
}

export function serializeExportRows(
  tableName: string,
  rows: Record<string, unknown>[],
  format: ExportFormat,
  includeHeaders: boolean,
): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (format === "json") return JSON.stringify(rows, null, 2);
  if (format === "sql") {
    const quoteIdentifier = (identifier: string) =>
      `"${identifier.replaceAll('"', '""')}"`;
    const table = tableName.split(".").map(quoteIdentifier).join(".");
    const columnList = columns.map(quoteIdentifier).join(", ");
    return rows
      .map((row) => {
        const values = columns.map((column) => {
          const value = row[column];
          if (value === null || value === undefined) return "NULL";
          if (typeof value === "number")
            return Number.isFinite(value) ? String(value) : "NULL";
          if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
          const text =
            typeof value === "string" ? value : JSON.stringify(value);
          return `'${(text ?? "").replaceAll("'", "''")}'`;
        });
        return `INSERT INTO ${table} (${columnList}) VALUES (${values.join(", ")});`;
      })
      .join("\n");
  }
  const csv = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = includeHeaders ? [columns.map(csv).join(",")] : [];
  for (const row of rows)
    lines.push(columns.map((column) => csv(row[column])).join(","));
  return lines.join("\r\n");
}
