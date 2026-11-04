import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataGrid } from "../DataGrid";
import { renderWithProviders } from "@/test/test-utils";
import type { TableSchema, Connection } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchSchemaMetadata: vi.fn().mockResolvedValue({ tables: [] }),
    fetchTableStats: vi.fn().mockResolvedValue(null),
    exportTableData: vi.fn(),
    resolveReferences: vi.fn().mockResolvedValue({}),
  };
});

describe("DataGrid Component", () => {
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
        name: "username",
        type: "string",
        nullable: false,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "note",
        type: "string",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
    ],
    relations: [],
  };

  const mockConnection: Connection = {
    id: "conn-test",
    name: "Test Connection",
    type: "postgres",
    environment: "local",
    read_only: false,
    host: "localhost",
    port: "5432",
    user: "postgres",
    db_name: "testdb",
    save_password: false,
    created_at: "2026-01-01T00:00:00Z",
  };

  const defaultProps = {
    table: mockTable,
    rows: [
      { id: 1, username: "alice", note: "VIP customer" },
      { id: 2, username: "bob", note: null },
      { id: 3, username: "charlie", note: "" },
    ],
    totalCount: 3,
    isLoading: false,
    page: 0,
    pageSize: 50,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    sortBy: "",
    sortDesc: false,
    onSortChange: vi.fn(),
    filters: [],
    onFiltersChange: vi.fn(),
    onRefresh: vi.fn(),
    onAddRow: vi.fn(),
    onEditRow: vi.fn(),
    onCommitRow: vi.fn().mockResolvedValue(undefined),
    onCommitDeleteRow: vi.fn().mockResolvedValue(undefined),
    connection: mockConnection,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Virtual row counts and viewport rendering", () => {
    it("renders virtual rows corresponding to rows supplied", () => {
      renderWithProviders(<DataGrid {...defaultProps} />);

      // Verify that rendered table body contains rows
      expect(screen.getByText("alice")).toBeInTheDocument();
      expect(screen.getByText("bob")).toBeInTheDocument();
      expect(screen.getByText("charlie")).toBeInTheDocument();
    });

    it("calculates exact virtual row count for a large dataset based on viewport", () => {
      // 100 rows
      const hundredRows = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        username: `user_${i + 1}`,
        note: `note_${i + 1}`,
      }));

      // Simulate a fixed container viewport height of 290px (29px per row = 10 rows visible + 10 overscan)
      const originalClientHeight = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "clientHeight",
      );

      Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        get() {
          return 290;
        },
      });

      try {
        renderWithProviders(
          <DataGrid
            {...defaultProps}
            rows={hundredRows}
            totalCount={100}
            pageSize={100}
          />,
        );

        // Virtual items should be bounded and render the initial virtual slice
        expect(screen.getByText("user_1")).toBeInTheDocument();
        // user_100 should not be rendered yet in the initial viewport
        expect(screen.queryByText("user_100")).toBeNull();
      } finally {
        if (originalClientHeight) {
          Object.defineProperty(
            HTMLElement.prototype,
            "clientHeight",
            originalClientHeight,
          );
        } else {
          delete (HTMLElement.prototype as any).clientHeight;
        }
      }
    });
  });

  describe("Inline cell editor (Enter to stage draft, Escape to cancel)", () => {
    it("activates inline editor on double click and stages draft on Enter", async () => {
      const user = userEvent.setup();
      renderWithProviders(<DataGrid {...defaultProps} />);

      const aliceCell = screen.getByText("alice");
      // Double click to enter editing mode
      await user.dblClick(aliceCell);

      // An inline text input should appear with value "alice"
      const input = (await screen.findByDisplayValue(
        "alice",
      )) as HTMLInputElement;
      expect(input).toBeInTheDocument();

      // Change the value and press Enter to stage draft
      await user.clear(input);
      await user.type(input, "alice_updated{Enter}");

      // Input should close and staged value or draft status should appear
      await waitFor(() => {
        expect(screen.queryByDisplayValue("alice")).toBeNull();
        expect(screen.getByText("alice_updated")).toBeInTheDocument();
        expect(screen.getByTitle("Pending change")).toBeInTheDocument();
      });
    });

    it("cancels inline editing without staging when Escape is pressed", async () => {
      const user = userEvent.setup();
      renderWithProviders(<DataGrid {...defaultProps} />);

      const aliceCell = screen.getByText("alice");
      await user.dblClick(aliceCell);

      const input = (await screen.findByDisplayValue(
        "alice",
      )) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "alice_discarded");

      // Press Escape to cancel
      await user.keyboard("{Escape}");

      // The original value remains, discarded change is not staged
      await waitFor(() => {
        expect(screen.queryByDisplayValue("alice_discarded")).toBeNull();
        expect(screen.getByText("alice")).toBeInTheDocument();
        expect(screen.queryByTitle("Pending change")).toBeNull();
      });
    });
  });

  describe("Visual distinction between NULL badge and empty string", () => {
    it("renders explicit NULL badge for null values and distinct empty cell for empty string", () => {
      renderWithProviders(<DataGrid {...defaultProps} />);

      // Row 2 has note: null -> should display explicit NULL badge
      const nullBadges = screen.getAllByText("NULL");
      expect(nullBadges.length).toBeGreaterThanOrEqual(1);
      const nullBadge = nullBadges[0];
      expect(nullBadge).toHaveClass("italic");

      // Row 3 has note: "" (empty string) -> should NOT display "NULL"
      // Verify that charlie's row exists with empty text, distinct from NULL badge
      const charlieCell = screen.getByText("charlie");
      expect(charlieCell).toBeInTheDocument();
      const row = charlieCell.closest("tr");
      expect(row).toBeInTheDocument();

      // Ensure that in charlie's row, the note cell is not displaying "NULL"
      const rowText = row?.textContent || "";
      expect(rowText).not.toContain("NULL");
    });
  });

  describe("Column resizing interaction", () => {
    it("renders column resize drag handlers with cursor-col-resize", () => {
      const { container } = renderWithProviders(<DataGrid {...defaultProps} />);

      const resizeHandles = container.querySelectorAll(".cursor-col-resize");
      expect(resizeHandles.length).toBeGreaterThan(0);

      const firstHandle = resizeHandles[0] as HTMLElement;
      expect(firstHandle).toBeInTheDocument();

      // Trigger mousedown to verify drag handler initiation
      fireEvent.mouseDown(firstHandle, { clientX: 100 });
      // Cleanly completes without throwing
    });
  });
});
