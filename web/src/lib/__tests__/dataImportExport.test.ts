import { describe, expect, it } from "vitest";
import { parseCSVPreview, serializeExportRows } from "@/lib/dataImportExport";

describe("CSV import parsing and validation", () => {
  it("parses commas, escaped quotes, and embedded newlines", () => {
    const result = parseCSVPreview(
      'name,note\r\nAlice,"one, two"\r\nBob,"say ""hello""\nand bye"',
    );

    expect(result.headers).toEqual(["name", "note"]);
    expect(result.rows).toEqual([
      ["Alice", "one, two"],
      ["Bob", 'say "hello"\nand bye'],
    ]);
    expect(result.rowCount).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("reports row-width, duplicate-header, and unclosed-quote errors", () => {
    expect(parseCSVPreview("name,name\nAlice,Bob").errors).toContain(
      "Header row contains duplicate column names.",
    );
    expect(parseCSVPreview("name,age\nAlice").errors).toContain(
      "Row 2 has 1 columns; expected 2.",
    );
    expect(parseCSVPreview('name\n"Alice').errors).toContain(
      "Unclosed quoted field on row 2.",
    );
  });
});

describe("export serialization", () => {
  it("quotes CSV delimiters and omits headers when requested", () => {
    const rows = [{ name: 'O"Reilly, Inc.', note: "line 1\nline 2" }];

    expect(serializeExportRows("companies", rows, "csv", true)).toBe(
      'name,note\r\n"O""Reilly, Inc.","line 1\nline 2"',
    );
    expect(serializeExportRows("companies", rows, "csv", false)).toBe(
      '"O""Reilly, Inc.","line 1\nline 2"',
    );
  });

  it("escapes SQL identifiers and strings and emits SQL NULL", () => {
    const result = serializeExportRows(
      'public."odd.table',
      [{ 'col"name': "it's fine", absent: null }],
      "sql",
      true,
    );

    expect(result).toBe(
      `INSERT INTO "public"."""odd"."table" ("col""name", "absent") VALUES ('it''s fine', NULL);`,
    );
  });
});
