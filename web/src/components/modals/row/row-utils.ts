import type { TableSchema, ColumnSchema } from "@/lib/types";

export interface FieldDiff {
  column: string;
  before: unknown;
  after: unknown;
}

export type DiffValueKind = "null" | "empty" | "bool" | "json" | "string";

export interface DiffValueDescriptor {
  kind: DiffValueKind;
  text: string;
  boolValue?: boolean;
}

export function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    (a === null || a === undefined || a === "") &&
    (b === null || b === undefined || b === "")
  ) {
    return true;
  }
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

export function describeDiffValue(val: unknown): DiffValueDescriptor {
  if (val === null || val === undefined) {
    return { kind: "null", text: "NULL" };
  }
  if (val === "") {
    return { kind: "empty", text: '""' };
  }
  if (typeof val === "boolean") {
    return { kind: "bool", text: String(val), boolValue: val };
  }
  if (typeof val === "object") {
    try {
      return { kind: "json", text: JSON.stringify(val) };
    } catch {
      return { kind: "string", text: String(val) };
    }
  }
  return { kind: "string", text: String(val) };
}

export function initializeFormData(
  table: TableSchema,
  initialRow?: Record<string, any> | null,
  isDuplicate = false,
): Record<string, any> {
  if (initialRow) {
    const data = { ...initialRow };
    delete data._isDuplicate;
    delete data._pb_id;
    if (isDuplicate) {
      table.columns.forEach((c) => {
        if (c.is_primary_key) {
          delete data[c.name];
        }
      });
    }
    return data;
  }
  const defaults: Record<string, any> = {};
  table.columns.forEach((c) => {
    if (!c.is_primary_key) {
      defaults[c.name] = "";
    }
  });
  return defaults;
}

type ColumnParser = (raw: any) => unknown;

const COLUMN_PARSERS: Record<string, ColumnParser> = {
  int: (raw) => {
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? raw : parsed;
  },
  float: (raw) => {
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? raw : parsed;
  },
  bool: (raw) => raw === "true" || raw === true,
  json: (raw) => {
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return raw;
    }
  },
};

export function parseColumnValue(col: ColumnSchema, raw: any): unknown {
  const parser = COLUMN_PARSERS[col.type];
  return parser ? parser(raw) : raw;
}

export function parseDynamicFieldValue(raw: any): unknown {
  if (raw === undefined || raw === "") return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function parseFormPayload(
  table: TableSchema,
  formData: Record<string, any>,
  dynamicFieldKeys: string[],
): Record<string, any> {
  const parsedValues: Record<string, any> = {};

  table.columns.forEach((col) => {
    const raw = formData[col.name];
    if (raw === undefined || raw === "") {
      if (!col.is_primary_key && col.nullable) {
        parsedValues[col.name] = null;
      }
      return;
    }
    parsedValues[col.name] = parseColumnValue(col, raw);
  });

  dynamicFieldKeys.forEach((key) => {
    const raw = formData[key];
    const parsed = parseDynamicFieldValue(raw);
    if (parsed !== undefined) {
      parsedValues[key] = parsed;
    }
  });

  return parsedValues;
}

export function calculateFieldDiffs(
  table: TableSchema,
  initialRow: Record<string, any>,
  parsedValues: Record<string, any>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const allKeys = Array.from(
    new Set([
      ...table.columns.map((c) => c.name),
      ...Object.keys(initialRow),
      ...Object.keys(parsedValues),
    ]),
  ).filter((k) => !k.startsWith("_pb_"));

  allKeys.forEach((key) => {
    const before = initialRow[key];
    const after = parsedValues[key];
    if (!areValuesEqual(before, after)) {
      diffs.push({
        column: key,
        before,
        after,
      });
    }
  });

  return diffs;
}

export function getFieldPlaceholder(
  col: ColumnSchema,
  isEditing: boolean,
  t: (key: string, opts?: any) => string,
): string {
  if (col.is_primary_key && !isEditing) {
    return col.name === "_id"
      ? t("rowModal.autoObjectId")
      : t("rowModal.autoManualPk");
  }
  if (col.default_value) {
    return t("rowModal.defaultPrefix", { val: col.default_value });
  }
  if (col.nullable) {
    return "NULL";
  }
  return "";
}

export function formatDynamicFieldValue(val: unknown): string {
  if (typeof val === "object" && val !== null) {
    return JSON.stringify(val);
  }
  return String(val ?? "");
}
