import type { ColumnSchema } from "@/lib/types";

export interface RowDraft {
  id: string;
  original: Record<string, any> | null;
  current: Record<string, any>;
  deleted: boolean;
  inserted: boolean;
}

export function createRowDraftId(
  row: Record<string, any>,
  columns: ColumnSchema[],
): string {
  const primaryKeys = columns.filter((column) => column.is_primary_key);
  const identity = primaryKeys.length
    ? primaryKeys.map((column) => [column.name, row[column.name]])
    : Object.entries(row)
        .filter(([key]) => !key.startsWith("_pb_"))
        .sort(([a], [b]) => a.localeCompare(b));
  return `row:${JSON.stringify(identity)}:${primaryKeys.length ? "pk" : "value"}`;
}

export function stageCellDraft(
  drafts: Record<string, RowDraft>,
  row: Record<string, any>,
  columnName: string,
  value: unknown,
  columns: ColumnSchema[],
): Record<string, RowDraft> {
  const id = row._pb_draft_id || createRowDraftId(row, columns);
  const existing = drafts[id];
  const inserted = existing?.inserted ?? Boolean(row._pb_draft_inserted);
  const cleanRow = Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith("_pb_")),
  );
  const original = inserted ? null : (existing?.original ?? cleanRow);
  const next: Record<string, RowDraft> = {
    ...drafts,
    [id]: {
      id,
      original,
      current: {
        ...(existing?.current ?? cleanRow),
        [columnName]: value,
      },
      deleted: false,
      inserted,
    },
  };
  if (
    !inserted &&
    JSON.stringify(next[id].original) === JSON.stringify(next[id].current)
  ) {
    delete next[id];
  }
  return next;
}
