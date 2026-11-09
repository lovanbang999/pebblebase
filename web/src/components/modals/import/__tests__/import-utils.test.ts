import { describe, it, expect } from "vitest";
import {
  isCopySupported,
  getEstimatedSize,
  formatFileSize,
  matchColumns,
  validateColumnMappings,
  EXPORT_FORMAT_OPTIONS,
} from "../import-utils";
import type { ColumnSchema, TableStats } from "@/lib/types";

describe("import-utils pure functions", () => {
  describe("isCopySupported", () => {
    it("returns true for formats that support clipboard copy", () => {
      expect(isCopySupported("csv")).toBe(true);
      expect(isCopySupported("json")).toBe(true);
      expect(isCopySupported("sql")).toBe(true);
    });

    it("returns false for formats that do not support clipboard copy", () => {
      expect(isCopySupported("parquet")).toBe(false);
      expect(isCopySupported("xlsx")).toBe(false);
      expect(isCopySupported("jsonl")).toBe(false);
    });
  });

  describe("getEstimatedSize", () => {
    it("returns a dash when stats are absent or zeroed", () => {
      expect(getEstimatedSize("csv", null)).toBe("—");
      expect(getEstimatedSize("csv", undefined)).toBe("—");
      expect(
        getEstimatedSize("csv", {
          total_rows: 0,
          size_bytes: 0,
          estimated_rows: false,
          last_updated: "",
        }),
      ).toBe("—");
    });

    it("uses size_bytes multiplied by format multiplier when size_bytes is positive", () => {
      const stats: TableStats = {
        total_rows: 1000,
        size_bytes: 1024 * 1024, // 1 MB raw
        estimated_rows: false,
        last_updated: "",
      };

      // csv = 0.9 -> 921.6 KB
      expect(getEstimatedSize("csv", stats)).toBe("921.6 KB");
      // json = 1.3 -> 1.3 MB
      expect(getEstimatedSize("json", stats)).toBe("1.3 MB");
      // sql = 1.0 -> 1.0 MB
      expect(getEstimatedSize("sql", stats)).toBe("1.0 MB");
      // jsonl = 1.1 -> 1.1 MB
      expect(getEstimatedSize("jsonl", stats)).toBe("1.1 MB");
      // xlsx = 0.4 -> 409.6 KB
      expect(getEstimatedSize("xlsx", stats)).toBe("409.6 KB");
      // parquet = 0.25 -> 256.0 KB
      expect(getEstimatedSize("parquet", stats)).toBe("256.0 KB");
    });

    it("falls back to total_rows * ESTIMATED_BYTES_PER_ROW when size_bytes is zero", () => {
      const stats: TableStats = {
        total_rows: 500, // 500 * 120 = 60,000 bytes
        size_bytes: 0,
        estimated_rows: false,
        last_updated: "",
      };

      // 60000 * 1.0 = 60000 B -> 58.6 KB
      expect(getEstimatedSize("sql", stats)).toBe("58.6 KB");
    });
  });

  describe("formatFileSize", () => {
    it("formats bytes under 1 KB as exact integer bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(512)).toBe("512 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("formats kilobytes with one decimal place", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(1024 * 500)).toBe("500.0 KB");
    });

    it("formats megabytes with one decimal place", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
      expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
    });
  });

  describe("matchColumns", () => {
    const tableColumns: ColumnSchema[] = [
      {
        name: "id",
        type: "int",
        nullable: false,
        is_primary_key: true,
        is_foreign_key: false,
      },
      {
        name: "first_name",
        type: "text",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "email_address",
        type: "text",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "created_at",
        type: "timestamp",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
    ];

    it("matches CSV headers case-insensitively and trims whitespace", () => {
      const csvHeaders = [
        " ID ",
        "First_Name",
        "EMAIL_ADDRESS",
        "unknown_field",
      ];
      const result = matchColumns(csvHeaders, tableColumns);

      expect(result).toEqual({
        ID: "id",
        First_Name: "first_name",
        EMAIL_ADDRESS: "email_address",
        unknown_field: "",
      });
    });

    it("returns empty mappings when no CSV headers are provided", () => {
      expect(matchColumns([], tableColumns)).toEqual({});
    });
  });

  describe("validateColumnMappings", () => {
    it("returns datagrid.noColumnsMapped when all mappings are empty or skipped", () => {
      const emptyResult = validateColumnMappings({
        id: "",
        name: "__skip__",
      });
      expect(emptyResult).toEqual({
        activeMappings: {},
        error: "datagrid.noColumnsMapped",
      });
    });

    it("returns datagrid.eachDbColOneCsvCol when duplicate CSV columns target the same DB column", () => {
      const duplicateResult = validateColumnMappings({
        csv_id: "id",
        csv_account_id: "id",
        csv_name: "name",
      });
      expect(duplicateResult).toEqual({
        activeMappings: {},
        error: "datagrid.eachDbColOneCsvCol",
      });
    });

    it("returns active mappings without skipped columns on valid input", () => {
      const validResult = validateColumnMappings({
        csv_id: "id",
        csv_name: "name",
        csv_extra: "__skip__",
        csv_unmapped: "",
      });
      expect(validResult).toEqual({
        activeMappings: {
          csv_id: "id",
          csv_name: "name",
        },
        error: null,
      });
    });
  });

  describe("EXPORT_FORMAT_OPTIONS", () => {
    it("defines 6 distinct export formats with valid icons and keys", () => {
      expect(EXPORT_FORMAT_OPTIONS).toHaveLength(6);
      const formats = EXPORT_FORMAT_OPTIONS.map((opt) => opt.value);
      expect(formats).toEqual([
        "csv",
        "json",
        "sql",
        "jsonl",
        "xlsx",
        "parquet",
      ]);

      EXPORT_FORMAT_OPTIONS.forEach((opt) => {
        expect(opt.labelKey).toBeTruthy();
        expect(opt.defaultLabel).toBeTruthy();
        expect(opt.icon).toBeDefined();
      });
    });
  });
});
