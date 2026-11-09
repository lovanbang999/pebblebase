import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportModal } from "../ImportModal";
import { renderWithProviders } from "@/test/test-utils";
import type { TableSchema } from "@/lib/types";
import * as api from "@/lib/api";
import * as referenceCache from "@/lib/referenceCache";
import * as operationEvents from "@/lib/operationEvents";

// Polyfill File.prototype.text and Blob.prototype.text for JSDOM test environment
if (typeof File !== "undefined" && typeof File.prototype.text === "undefined") {
  File.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
if (typeof Blob !== "undefined" && typeof Blob.prototype.text === "undefined") {
  Blob.prototype.text = File.prototype.text;
}

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    importTableCSV: vi.fn(),
    exportTableData: vi.fn(),
  };
});

vi.mock("@/lib/referenceCache", () => ({
  invalidateReferenceCache: vi.fn(),
}));

vi.mock("@/lib/operationEvents", () => ({
  emitOperationEvent: vi.fn(),
}));

describe("ImportModal Component Characterization", () => {
  const mockTable: TableSchema = {
    name: "users",
    columns: [
      {
        name: "id",
        type: "int",
        nullable: false,
        is_primary_key: true,
        is_foreign_key: false,
      },
      {
        name: "name",
        type: "string",
        nullable: false,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "email",
        type: "string",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
    ],
    relations: [],
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    connId: "conn-123",
    table: mockTable,
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Modal Visibility & Mode Navigation", () => {
    it("renders in import mode by default and displays upload drop zone", () => {
      renderWithProviders(<ImportModal {...defaultProps} />);

      expect(
        screen.getByRole("heading", { name: /Import CSV into "users"/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Choose a CSV file or drag & drop here/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Import CSV/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Export Data/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Import Records/i }),
      ).toBeDisabled();
    });

    it("renders in export mode when initialMode is export and switches tabs", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ImportModal {...defaultProps} initialMode="export" />,
      );

      expect(
        screen.getByRole("heading", { name: /Export Table/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Export Format/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Download Export/i }),
      ).toBeInTheDocument();

      // Switch to Import tab
      const importTab = screen.getByRole("button", { name: /Import CSV/i });
      await user.click(importTab);

      expect(
        screen.getByRole("heading", { name: /Import CSV into "users"/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Choose a CSV file or drag & drop here/i),
      ).toBeInTheDocument();
    });

    it("disables import tab and shows read-only alert when isReadOnly is true", () => {
      renderWithProviders(
        <ImportModal
          {...defaultProps}
          isReadOnly={true}
          initialMode="import"
        />,
      );

      const importTab = screen.getByRole("button", { name: /Import CSV/i });
      expect(importTab).toBeDisabled();
      expect(
        screen.getByText(/Imports are disabled for this read-only connection/i),
      ).toBeInTheDocument();
    });

    it("invokes onClose when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderWithProviders(<ImportModal {...defaultProps} onClose={onClose} />);

      const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelBtn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Export Mode Functionality", () => {
    it("renders export format options and updates estimated file size", () => {
      renderWithProviders(
        <ImportModal
          {...defaultProps}
          initialMode="export"
          tableStats={{
            total_rows: 2500,
            size_bytes: 1024 * 1024,
          }}
        />,
      );

      expect(screen.getByText("2,500")).toBeInTheDocument();
      // CSV format multiplier is 0.9 -> 1024*1024*0.9 = 921.6 KB
      expect(screen.getByText("921.6 KB")).toBeInTheDocument();
    });

    it("toggles CSV header checkbox and row scope buttons", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ImportModal {...defaultProps} initialMode="export" />,
      );

      const headerCheckbox = screen.getByRole("checkbox", {
        name: /Include header row/i,
      }) as HTMLInputElement;
      expect(headerCheckbox.checked).toBe(true);
      await user.click(headerCheckbox);
      expect(headerCheckbox.checked).toBe(false);

      const filteredScopeBtn = screen.getByRole("button", {
        name: /All filtered/i,
      });
      await user.click(filteredScopeBtn);
      expect(filteredScopeBtn).toHaveClass("bg-secondary");
    });

    it("successfully triggers table data file export download", async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(["id,name\n1,Alice"], { type: "text/csv" });
      vi.mocked(api.exportTableData).mockResolvedValue(mockBlob);

      renderWithProviders(
        <ImportModal
          {...defaultProps}
          initialMode="export"
          page={1}
          pageSize={50}
          sortBy="name"
          sortDesc={false}
        />,
      );

      const downloadBtn = screen.getByRole("button", {
        name: /Download Export/i,
      });
      await user.click(downloadBtn);

      await waitFor(() => {
        expect(api.exportTableData).toHaveBeenCalledWith(
          "conn-123",
          "users",
          "csv",
          {
            limit: 50,
            offset: 50,
            sort_by: "name",
            sort_desc: false,
            filters: undefined,
            include_header: true,
          },
        );
      });

      expect(
        await screen.findByText(/Export completed successfully/i),
      ).toBeInTheDocument();
    });

    it("handles export API failure and displays error alert", async () => {
      const user = userEvent.setup();
      vi.mocked(api.exportTableData).mockRejectedValue(
        new Error("Database export timed out"),
      );

      renderWithProviders(
        <ImportModal {...defaultProps} initialMode="export" />,
      );

      const downloadBtn = screen.getByRole("button", {
        name: /Download Export/i,
      });
      await user.click(downloadBtn);

      expect(
        await screen.findByText(/Database export timed out/i),
      ).toBeInTheDocument();
    });

    it("copies exported data to clipboard when Copy output is selected", async () => {
      const user = userEvent.setup();
      const writeSpy = vi.spyOn(navigator.clipboard, "writeText");

      const rows = [
        { id: 1, name: "Alice", email: "alice@example.com" },
        { id: 2, name: "Bob", email: "bob@example.com" },
      ];

      renderWithProviders(
        <ImportModal {...defaultProps} initialMode="export" rows={rows} />,
      );

      const copyOutputBtn = screen.getByRole("button", { name: /^Copy$/i });
      await user.click(copyOutputBtn);

      const copyExportBtn = screen.getByRole("button", {
        name: /Copy Export/i,
      });
      await user.click(copyExportBtn);

      await waitFor(() => {
        expect(writeSpy).toHaveBeenCalledTimes(1);
      });

      expect(
        await screen.findByText(/Export copied to clipboard./i),
      ).toBeInTheDocument();
    });

    it("disables Copy output button when export scope is filtered", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ImportModal {...defaultProps} initialMode="export" />,
      );

      const filteredScopeBtn = screen.getByRole("button", {
        name: /All filtered/i,
      });
      await user.click(filteredScopeBtn);

      const copyOutputBtn = screen.getByRole("button", { name: /^Copy$/i });
      expect(copyOutputBtn).toBeDisabled();
    });
  });

  describe("Import Mode File Handling & Preview", () => {
    it("rejects non-CSV file and displays format error alert", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const invalidFile = new File(['{"a": 1}'], "data.json", {
        type: "application/json",
      });

      await user.upload(fileInput, invalidFile);

      expect(
        await screen.findByText(/Standard CSV file \(UTF-8 encoded\)/i),
      ).toBeInTheDocument();
    });

    it("handles empty CSV files without headers and displays error", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const emptyFile = new File(["\n"], "empty.csv", { type: "text/csv" });

      await user.upload(fileInput, emptyFile);

      expect(
        await screen.findByText(/Please select a valid CSV file to begin\./i),
      ).toBeInTheDocument();
    });

    it("parses valid CSV, renders selected file banner, preview table, and auto-mapped columns", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const validCsv = new File(
        ["id,name,email\n1,Alice,alice@example.com\n2,Bob,bob@example.com"],
        "users.csv",
        { type: "text/csv" },
      );

      await user.upload(fileInput, validCsv);

      // File banner
      expect(await screen.findByText("users.csv")).toBeInTheDocument();
      expect(screen.getByText(/3 columns detected/i)).toBeInTheDocument();

      // Column mapping section
      expect(screen.getByText(/Column Mapping/i)).toBeInTheDocument();
      expect(screen.getByText(/3 of 3 mapped/i)).toBeInTheDocument();

      // Data preview table
      expect(screen.getByText(/Data Preview · 2 rows/i)).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("clears selected file and returns to drop zone when X button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const validCsv = new File(["id,name\n1,Alice"], "users.csv", {
        type: "text/csv",
      });

      await user.upload(fileInput, validCsv);
      expect(await screen.findByText("users.csv")).toBeInTheDocument();

      // Click remove button on banner
      const clearBtn = screen
        .getByText("users.csv")
        .closest("div.border-border")
        ?.querySelector("button");
      expect(clearBtn).toBeInTheDocument();
      await user.click(clearBtn!);

      expect(screen.queryByText("users.csv")).not.toBeInTheDocument();
      expect(
        screen.getByText(/Choose a CSV file or drag & drop here/i),
      ).toBeInTheDocument();
    });

    it("displays validation warning when CSV preview has malformed rows", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      // Row 2 only has 1 field while header has 2
      const malformedCsv = new File(["id,name\n1,Alice\n2"], "malformed.csv", {
        type: "text/csv",
      });

      await user.upload(fileInput, malformedCsv);

      expect(
        await screen.findByText(
          /CSV validation found 1 issue\(s\); import is blocked\./i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Import Records/i }),
      ).toBeDisabled();
    });
  });

  describe("Column Mapping Validation", () => {
    it("indicates primary key columns with a PK badge", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const csv = new File(["id,name\n1,Alice"], "users.csv", {
        type: "text/csv",
      });

      await user.upload(fileInput, csv);
      expect(await screen.findByText("users.csv")).toBeInTheDocument();

      // "id" is primary key, PK badge should appear
      expect(screen.getByText("PK")).toBeInTheDocument();
    });

    it("blocks import submission when all columns are skipped", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const csv = new File(["colA\nval1"], "test.csv", {
        type: "text/csv",
      });

      await user.upload(fileInput, csv);
      expect(await screen.findByText("test.csv")).toBeInTheDocument();

      // colA does not match any table column ("id", "name", "email"), so mappedCount is 0
      const importBtn = screen.getByRole("button", { name: /Import Records/i });
      await user.click(importBtn);

      expect(
        await screen.findByText(
          /Please map at least one column to import data\./i,
        ),
      ).toBeInTheDocument();
      expect(api.importTableCSV).not.toHaveBeenCalled();
    });

    it("blocks import submission when duplicate columns are mapped to the same target", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const csv = new File(
        ["first_name,full_name\nAlice,Alice Smith"],
        "names.csv",
        { type: "text/csv" },
      );

      await user.upload(fileInput, csv);
      expect(await screen.findByText("names.csv")).toBeInTheDocument();

      // Select triggers for both headers
      const triggers = screen.getAllByRole("combobox");
      expect(triggers.length).toBeGreaterThanOrEqual(2);

      // Map first_name -> name
      await user.click(triggers[0]);
      const nameOptions1 = await screen.findAllByRole("option", {
        name: /^name/i,
      });
      await user.click(nameOptions1[0]);

      // Map full_name -> name
      await user.click(triggers[1]);
      const nameOptions2 = await screen.findAllByRole("option", {
        name: /^name/i,
      });
      await user.click(nameOptions2[0]);

      const importBtn = screen.getByRole("button", { name: /Import Records/i });
      await user.click(importBtn);

      expect(
        await screen.findByText(
          /Each database column can only be mapped from one CSV column\./i,
        ),
      ).toBeInTheDocument();
      expect(api.importTableCSV).not.toHaveBeenCalled();
    });
  });

  describe("Import Submission & Completion", () => {
    it("submits valid import mappings, calls onSuccess and displays success screen", async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      vi.mocked(api.importTableCSV).mockResolvedValue({
        inserted_count: 42,
        duration_ms: 128,
      });

      renderWithProviders(
        <ImportModal {...defaultProps} onSuccess={onSuccess} />,
      );

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const csv = new File(["id,name\n1,Alice\n2,Bob"], "users.csv", {
        type: "text/csv",
      });

      await user.upload(fileInput, csv);
      expect(await screen.findByText("users.csv")).toBeInTheDocument();

      const importBtn = screen.getByRole("button", { name: /Import Records/i });
      await user.click(importBtn);

      await waitFor(() => {
        expect(api.importTableCSV).toHaveBeenCalledWith(
          "conn-123",
          "users",
          csv,
          {
            id: "id",
            name: "name",
          },
        );
      });

      expect(referenceCache.invalidateReferenceCache).toHaveBeenCalledWith(
        "conn-123",
      );
      expect(onSuccess).toHaveBeenCalledWith({
        inserted_count: 42,
        duration_ms: 128,
      });

      // Displays success banner
      expect(
        await screen.findByRole("heading", { name: /Import Complete/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Successfully inserted 42 records in 128ms\./i),
      ).toBeInTheDocument();

      // Close button in success view
      const closeButtons = screen.getAllByRole("button", { name: /Close/i });
      await user.click(closeButtons[closeButtons.length - 1]);
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it("handles import API failure, displays error alert, and emits operation event", async () => {
      const user = userEvent.setup();
      vi.mocked(api.importTableCSV).mockRejectedValue(
        new Error("UNIQUE constraint violation: users.id"),
      );

      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const csv = new File(["id,name\n1,Alice"], "users.csv", {
        type: "text/csv",
      });

      await user.upload(fileInput, csv);
      expect(await screen.findByText("users.csv")).toBeInTheDocument();

      const importBtn = screen.getByRole("button", { name: /Import Records/i });
      await user.click(importBtn);

      expect(
        await screen.findByText(/UNIQUE constraint violation: users\.id/i),
      ).toBeInTheDocument();

      expect(operationEvents.emitOperationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "import",
          severity: "error",
          connectionId: "conn-123",
        }),
      );
    });
  });

  describe("Extended Characterization (Gap Coverage)", () => {
    it("switches export format across supported types, updates estimated size and toggles header row visibility", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ImportModal
          {...defaultProps}
          initialMode="export"
          tableStats={{
            total_rows: 2500,
            size_bytes: 1024 * 1024,
          }}
        />,
      );

      // Default CSV: 921.6 KB, checkbox present
      expect(screen.getByText("921.6 KB")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: /Include header row/i }),
      ).toBeInTheDocument();

      const selectTrigger = screen.getByRole("combobox");

      // Switch to JSON (1.3 multiplier -> 1.3 MB)
      await user.click(selectTrigger);
      const jsonOption = await screen.findByRole("option", {
        name: /JSON \(\.json\)/i,
      });
      await user.click(jsonOption);
      expect(screen.getByText("1.3 MB")).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: /Include header row/i }),
      ).not.toBeInTheDocument();

      // Switch to SQL (1.0 multiplier -> 1.0 MB)
      await user.click(selectTrigger);
      const sqlOption = await screen.findByRole("option", {
        name: /SQL INSERT/i,
      });
      await user.click(sqlOption);
      expect(screen.getByText("1.0 MB")).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: /Include header row/i }),
      ).not.toBeInTheDocument();

      // Switch to JSONL (1.1 multiplier -> 1.1 MB)
      await user.click(selectTrigger);
      const jsonlOption = await screen.findByRole("option", { name: /JSONL/i });
      await user.click(jsonlOption);
      expect(screen.getByText("1.1 MB")).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: /Include header row/i }),
      ).not.toBeInTheDocument();

      // Switch to Excel XLSX (0.4 multiplier -> 409.6 KB)
      await user.click(selectTrigger);
      const xlsxOption = await screen.findByRole("option", { name: /Excel/i });
      await user.click(xlsxOption);
      expect(screen.getByText("409.6 KB")).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: /Include header row/i }),
      ).not.toBeInTheDocument();

      // Switch to Parquet (0.25 multiplier -> 256.0 KB)
      await user.click(selectTrigger);
      const parquetOption = await screen.findByRole("option", {
        name: /Parquet/i,
      });
      await user.click(parquetOption);
      expect(screen.getByText("256.0 KB")).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: /Include header row/i }),
      ).not.toBeInTheDocument();

      // Switch back to CSV: checkbox reappears
      await user.click(selectTrigger);
      const csvOption = await screen.findByRole("option", {
        name: /CSV \(\.csv\)/i,
      });
      await user.click(csvOption);
      expect(screen.getByText("921.6 KB")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: /Include header row/i }),
      ).toBeInTheDocument();
    });

    it("passes distinct pagination/limit parameters for All filtered vs Current page export scopes", async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(["id\n1"], { type: "text/csv" });
      vi.mocked(api.exportTableData).mockResolvedValue(mockBlob);

      const filters = [
        { column: "status", operator: "eq" as const, value: "active" },
      ];

      renderWithProviders(
        <ImportModal
          {...defaultProps}
          initialMode="export"
          page={2}
          pageSize={25}
          sortBy="created_at"
          sortDesc={true}
          filters={filters}
        />,
      );

      // Default is "page": limit = 25, offset = 50
      const downloadBtn = screen.getByRole("button", {
        name: /Download Export/i,
      });
      await user.click(downloadBtn);

      await waitFor(() => {
        expect(api.exportTableData).toHaveBeenCalledWith(
          "conn-123",
          "users",
          "csv",
          {
            limit: 25,
            offset: 50,
            sort_by: "created_at",
            sort_desc: true,
            filters,
            include_header: true,
          },
        );
      });

      // Switch to "All filtered"
      const allFilteredBtn = screen.getByRole("button", {
        name: /All filtered/i,
      });
      await user.click(allFilteredBtn);
      await user.click(downloadBtn);

      await waitFor(() => {
        expect(api.exportTableData).toHaveBeenCalledWith(
          "conn-123",
          "users",
          "csv",
          {
            limit: undefined,
            offset: undefined,
            sort_by: "created_at",
            sort_desc: true,
            filters,
            include_header: true,
          },
        );
      });
    });

    it("supports drag and drop of CSV file onto the drop zone with dragover styling", async () => {
      renderWithProviders(<ImportModal {...defaultProps} />);

      const dropZone = screen
        .getByText(/Choose a CSV file or drag & drop here/i)
        .closest("div.cursor-pointer")!;
      expect(dropZone).toBeInTheDocument();

      // Trigger dragover
      fireEvent.dragOver(dropZone);
      expect(dropZone).toHaveClass("border-primary");

      // Trigger dragleave
      fireEvent.dragLeave(dropZone);
      expect(dropZone).not.toHaveClass("border-primary");

      // Trigger drop
      const validCsv = new File(["id,name\n1,Alice"], "dragged.csv", {
        type: "text/csv",
      });
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [validCsv],
        },
      });

      expect(await screen.findByText("dragged.csv")).toBeInTheDocument();
      expect(
        await screen.findByText(/Data Preview · 1 rows/i),
      ).toBeInTheDocument();
    });

    it("disables download button during pending export and ignores duplicate clicks", async () => {
      const user = userEvent.setup();

      let resolveExport: (blob: Blob) => void;
      const exportPromise = new Promise<Blob>((resolve) => {
        resolveExport = resolve;
      });
      vi.mocked(api.exportTableData).mockReturnValue(exportPromise);

      renderWithProviders(
        <ImportModal {...defaultProps} initialMode="export" />,
      );

      const exportBtn = screen.getByRole("button", {
        name: /Download Export/i,
      });
      await user.click(exportBtn);

      expect(exportBtn).toBeDisabled();
      expect(screen.getByText(/Exporting\.\.\./i)).toBeInTheDocument();

      // Second click while pending should not trigger export again
      await user.click(exportBtn);
      expect(api.exportTableData).toHaveBeenCalledTimes(1);

      resolveExport!(new Blob(["ok"], { type: "text/csv" }));
    });

    it("disables import button during pending import and ignores duplicate clicks", async () => {
      const user = userEvent.setup();

      let resolveImport: (val: any) => void;
      const importPromise = new Promise<{
        inserted_count: number;
        duration_ms: number;
      }>((resolve) => {
        resolveImport = resolve;
      });
      vi.mocked(api.importTableCSV).mockReturnValue(importPromise);

      renderWithProviders(
        <ImportModal {...defaultProps} initialMode="import" />,
      );

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const csv = new File(["id,name\n1,Alice"], "users.csv", {
        type: "text/csv",
      });
      await user.upload(fileInput, csv);
      expect(await screen.findByText("users.csv")).toBeInTheDocument();

      const importBtn = screen.getByRole("button", { name: /Import Records/i });
      await user.click(importBtn);

      expect(importBtn).toBeDisabled();
      expect(screen.getByText(/Importing\.\.\./i)).toBeInTheDocument();

      await user.click(importBtn);
      expect(api.importTableCSV).toHaveBeenCalledTimes(1);

      resolveImport!({ inserted_count: 1, duration_ms: 50 });
    });

    it("excludes skipped columns when submitting partial column mappings", async () => {
      const user = userEvent.setup();
      vi.mocked(api.importTableCSV).mockResolvedValue({
        inserted_count: 5,
        duration_ms: 30,
      });

      renderWithProviders(<ImportModal {...defaultProps} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const csv = new File(
        ["id,name,email\n1,Alice,alice@example.com"],
        "users.csv",
        { type: "text/csv" },
      );

      await user.upload(fileInput, csv);
      expect(await screen.findByText("users.csv")).toBeInTheDocument();
      expect(screen.getByText("3 of 3 mapped")).toBeInTheDocument();

      // Find comboboxes for column mappings
      const triggers = screen.getAllByRole("combobox");
      expect(triggers.length).toBe(3);

      // Skip the third column (email)
      await user.click(triggers[2]);
      const skipOption = await screen.findByRole("option", {
        name: /\(Skip column\)/i,
      });
      await user.click(skipOption);

      expect(screen.getByText("2 of 3 mapped")).toBeInTheDocument();

      const importBtn = screen.getByRole("button", { name: /Import Records/i });
      await user.click(importBtn);

      await waitFor(() => {
        expect(api.importTableCSV).toHaveBeenCalledWith(
          "conn-123",
          "users",
          csv,
          {
            id: "id",
            name: "name",
          },
        );
      });
    });

    it("resets file and preview state when modal closes and clears error banner on tab switch", async () => {
      const user = userEvent.setup();
      let open = true;
      const handleClose = vi.fn(() => {
        open = false;
      });

      const { rerender } = renderWithProviders(
        <ImportModal {...defaultProps} isOpen={open} onClose={handleClose} />,
      );

      // Upload file in import mode
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const csv = new File(["id,name\n1,Alice"], "users.csv", {
        type: "text/csv",
      });
      await user.upload(fileInput, csv);
      expect(await screen.findByText("users.csv")).toBeInTheDocument();

      // Cancel closes and resets modal state
      const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelBtn);
      expect(handleClose).toHaveBeenCalled();

      // Reopen modal: state is clean, drop zone is back
      rerender(
        <ImportModal {...defaultProps} isOpen={false} onClose={handleClose} />,
      );
      rerender(
        <ImportModal {...defaultProps} isOpen={true} onClose={handleClose} />,
      );

      expect(screen.queryByText("users.csv")).not.toBeInTheDocument();
      expect(
        screen.getByText(/Choose a CSV file or drag & drop here/i),
      ).toBeInTheDocument();

      // Test tab switching clears error banner
      const invalidFile = new File(['{"bad": true}'], "data.json", {
        type: "application/json",
      });
      const fileInput2 = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      await user.upload(fileInput2, invalidFile);
      expect(
        await screen.findByText(/Standard CSV file \(UTF-8 encoded\)/i),
      ).toBeInTheDocument();

      // Switch to export tab: error is cleared
      const exportTab = screen.getByRole("button", { name: /Export Data/i });
      await user.click(exportTab);
      expect(
        screen.queryByText(/Standard CSV file \(UTF-8 encoded\)/i),
      ).not.toBeInTheDocument();
    });
  });
});
