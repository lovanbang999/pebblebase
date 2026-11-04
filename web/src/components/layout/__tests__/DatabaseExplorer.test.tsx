import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatabaseExplorer } from "../DatabaseExplorer";
import { renderWithProviders } from "@/test/test-utils";
import type { Connection, TableSchema } from "@/lib/types";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    exportTableData: vi
      .fn()
      .mockResolvedValue(new Blob(["id,name\n1,alice"], { type: "text/csv" })),
    fetchTableDDL: vi
      .fn()
      .mockResolvedValue({ ddl: "CREATE TABLE users (id int);" }),
  };
});

describe("DatabaseExplorer Tree Component", () => {
  const mockPostgresConnection: Connection = {
    id: "conn-prod-1",
    name: "Production PostgreSQL",
    type: "postgres",
    environment: "production",
    read_only: false,
    host: "db.production.internal",
    port: "5432",
    user: "postgres",
    db_name: "prod_db",
    save_password: false,
    created_at: "2026-01-01T00:00:00Z",
  };

  const mockMssqlConnection: Connection = {
    id: "conn-mssql-1",
    name: "Enterprise MSSQL",
    type: "mssql",
    environment: "staging",
    read_only: false,
    host: "mssql.internal",
    port: "1433",
    user: "sa",
    db_name: "master",
    save_password: false,
    created_at: "2026-01-01T00:00:00Z",
  };

  const mockPostgresTables: TableSchema[] = [
    {
      name: "users",
      schema_name: "public",
      columns: [
        {
          name: "id",
          type: "int",
          nullable: false,
          is_primary_key: true,
          is_foreign_key: false,
        },
        {
          name: "email",
          type: "string",
          nullable: false,
          is_primary_key: false,
          is_foreign_key: false,
        },
      ],
      relations: [],
    },
    {
      name: "active_users_view",
      schema_name: "public",
      columns: [
        {
          name: "id",
          type: "int",
          nullable: false,
          is_primary_key: false,
          is_foreign_key: false,
        },
      ],
      relations: [],
    },
  ];

  const mockMssqlTables: TableSchema[] = [
    {
      name: "analytics.monthly_revenue",
      columns: [
        {
          name: "id",
          type: "int",
          nullable: false,
          is_primary_key: true,
          is_foreign_key: false,
        },
      ],
      relations: [],
    },
  ];

  const defaultProps = {
    connections: [mockPostgresConnection, mockMssqlConnection],
    canManageConnections: true,
    selectedConnectionId: null,
    selectedTable: null,
    activeConnectionId: null,
    tablesByConnection: {
      "conn-prod-1": mockPostgresTables,
      "conn-mssql-1": mockMssqlTables,
    },
    statusByConnection: {
      "conn-prod-1": {
        isLoading: false,
        isFetching: false,
        isError: false,
        isSuccess: true,
      },
      "conn-mssql-1": {
        isLoading: false,
        isFetching: false,
        isError: false,
        isSuccess: true,
      },
    },
    expandedNodeIds: [
      "connection:conn-prod-1",
      "connection:conn-prod-1:objects",
      "connection:conn-mssql-1",
      "connection:conn-mssql-1:schema:analytics",
    ],
    onToggleNode: vi.fn(),
    onExpandNodes: vi.fn(),
    onCollapseAll: vi.fn(),
    onSelectConnection: vi.fn(),
    onSelectTable: vi.fn(),
    onOpenQuery: vi.fn(),
    onOpenERD: vi.fn(),
    onOpenDiff: vi.fn(),
    onImportTable: vi.fn(),
    onOpenNewConnection: vi.fn(),
    onHideToolWindow: vi.fn(),
    onRefreshConnection: vi.fn(),
    onDuplicateConnection: vi.fn(),
    onEditConnection: vi.fn(),
    onDeleteConnection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Schema, table, view, and stored procedure tree expansion", () => {
    it("renders connections, schemas, groups, and child table/view nodes when expanded", () => {
      renderWithProviders(<DatabaseExplorer {...defaultProps} />);

      // Connection nodes
      expect(screen.getByText("Production PostgreSQL")).toBeInTheDocument();
      expect(screen.getByText("Enterprise MSSQL")).toBeInTheDocument();

      // Groups and schemas
      expect(screen.getByText("Tables")).toBeInTheDocument();
      expect(screen.getByText("analytics")).toBeInTheDocument();

      // Tables, views
      expect(screen.getByText("users")).toBeInTheDocument();
      expect(screen.getByText("active_users_view")).toBeInTheDocument();
      expect(screen.getByText("monthly_revenue")).toBeInTheDocument();
    });

    it("triggers onToggleNode when clicking expandable nodes", async () => {
      const user = userEvent.setup();
      const onToggleNode = vi.fn();
      renderWithProviders(
        <DatabaseExplorer {...defaultProps} onToggleNode={onToggleNode} />,
      );

      const connNode = screen.getByText("Production PostgreSQL");
      await user.click(connNode);

      expect(onToggleNode).toHaveBeenCalledWith("connection:conn-prod-1");
    });
  });

  describe("Right-click context menu actions (Query table, Export, Delete)", () => {
    it("opens context menu on right click and executes Query table action", async () => {
      const user = userEvent.setup();
      const onOpenQuery = vi.fn();
      renderWithProviders(
        <DatabaseExplorer {...defaultProps} onOpenQuery={onOpenQuery} />,
      );

      const tableNode = screen.getByText("users");
      fireEvent.contextMenu(tableNode, { clientX: 200, clientY: 300 });

      // Context menu should appear
      const selectTop100 = await screen.findByRole("menuitem", {
        name: /Select Top 100|Chọn 100 dòng đầu/i,
      });
      expect(selectTop100).toBeInTheDocument();

      await user.click(selectTop100);

      expect(onOpenQuery).toHaveBeenCalledWith(
        "conn-prod-1",
        expect.stringContaining('SELECT * FROM "public"."users" LIMIT 100;'),
        expect.stringContaining("users"),
      );
    });

    it("triggers table export action from context menu", async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatabaseExplorer {...defaultProps} />);

      const tableNode = screen.getByText("users");
      fireEvent.contextMenu(tableNode, { clientX: 200, clientY: 300 });

      const exportCsv = await screen.findByRole("menuitem", {
        name: /Export as CSV|Xuất dạng CSV/i,
      });
      expect(exportCsv).toBeInTheDocument();

      await user.click(exportCsv);

      await waitFor(() => {
        expect(api.exportTableData).toHaveBeenCalledWith(
          "conn-prod-1",
          "users",
          "csv",
        );
      });
    });

    it("triggers table danger modal (Truncate/Drop) from context menu", async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatabaseExplorer {...defaultProps} />);

      const tableNode = screen.getByText("users");
      fireEvent.contextMenu(tableNode, { clientX: 200, clientY: 300 });

      const dropItem = await screen.findByRole("menuitem", {
        name: /Drop Table|Xóa bảng/i,
      });
      expect(dropItem).toBeInTheDocument();

      await user.click(dropItem);

      // Danger modal should be opened with drop confirmation
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Drop Table: users/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Delete Connection confirmation dialog", () => {
    it("requires exact connection name input before enabling delete button with warning red styling", async () => {
      const user = userEvent.setup();
      const onDeleteConnection = vi.fn();
      renderWithProviders(
        <DatabaseExplorer
          {...defaultProps}
          onDeleteConnection={onDeleteConnection}
        />,
      );

      // Click delete connection button for the first connection
      const deleteButtons = screen.getAllByTitle(
        /Delete connection|Xóa kết nối/i,
      );
      expect(deleteButtons.length).toBeGreaterThan(0);
      await user.click(deleteButtons[0]);

      // Confirmation dialog opens
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      // Find the confirm delete action button
      const confirmDeleteBtn = screen.getByRole("button", {
        name: /Delete connection|Xóa kết nối/i,
      });
      expect(confirmDeleteBtn).toBeInTheDocument();

      // Verify button maintains warning red color on hover (hover:bg-destructive/90)
      expect(confirmDeleteBtn).toHaveClass("hover:bg-destructive/90");

      // Initially disabled
      expect(confirmDeleteBtn).toBeDisabled();

      // Find input field to confirm
      const confirmInput = screen.getByPlaceholderText(
        /Type.*to confirm|Nhập.*để xác nhận/i,
      );
      expect(confirmInput).toBeInTheDocument();

      // Type partial or wrong name
      await user.type(confirmInput, "Wrong Name");
      expect(confirmDeleteBtn).toBeDisabled();

      // Clear and type exact connection name
      await user.clear(confirmInput);
      await user.type(confirmInput, "Production PostgreSQL");

      // Delete button must now be enabled
      expect(confirmDeleteBtn).toBeEnabled();

      // Click confirm delete
      await user.click(confirmDeleteBtn);

      expect(onDeleteConnection).toHaveBeenCalledTimes(1);
      expect(onDeleteConnection).toHaveBeenCalledWith("conn-prod-1");
    });
  });
});
