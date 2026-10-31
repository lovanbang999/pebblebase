import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/lib/types";
import { createRowDraftId, stageCellDraft } from "@/lib/rowDrafts";

const columns: ColumnSchema[] = [
  {
    name: "id",
    type: "integer",
    nullable: false,
    is_primary_key: true,
    is_foreign_key: false,
  },
  {
    name: "name",
    type: "text",
    nullable: true,
    is_primary_key: false,
    is_foreign_key: false,
  },
  {
    name: "city",
    type: "text",
    nullable: true,
    is_primary_key: false,
    is_foreign_key: false,
  },
];

describe("primary-keyed pending row drafts", () => {
  it("keeps the same identity when row values or display position change", () => {
    const original = { id: 7, name: "Ada", city: "London" };
    const sortedVersion = { city: "Paris", name: "Grace", id: 7 };

    expect(createRowDraftId(original, columns)).toBe(
      createRowDraftId(sortedVersion, columns),
    );
    expect(createRowDraftId(original, columns)).toContain('[["id",7]]');
  });

  it("stages edits by primary key, preserves the original and removes a reverted draft", () => {
    const row = { id: 7, name: "Ada", city: "London" };
    const staged = stageCellDraft({}, row, "name", "Augusta", columns);
    const id = createRowDraftId(row, columns);

    expect(staged[id]).toMatchObject({
      original: row,
      current: { id: 7, name: "Augusta", city: "London" },
      inserted: false,
      deleted: false,
    });

    const reverted = stageCellDraft(
      staged,
      staged[id].current,
      "name",
      "Ada",
      columns,
    );
    expect(reverted[id]).toBeUndefined();
  });

  it("preserves inserted-row identity while staging another cell", () => {
    const insertedRow = {
      id: 8,
      name: "New",
      _pb_draft_id: "insert:8",
      _pb_draft_inserted: true,
    };
    const staged = stageCellDraft({}, insertedRow, "city", "Rome", columns);

    expect(staged["insert:8"]).toMatchObject({
      original: null,
      current: { id: 8, name: "New", city: "Rome" },
      inserted: true,
    });
  });
});
