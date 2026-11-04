import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryConsole } from "../QueryConsole";
import { renderWithProviders } from "@/test/test-utils";
import type { Connection, TableSchema } from "@/lib/types";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    executeRawQuery: vi.fn(),
    explainQuery: vi.fn(),
    createSavedQuery: vi.fn(),
  };
});

describe("QueryConsole Component", () => {
  const mockConnection: Connection = {
    id: "conn-query-test",
    name: "Analytics Postgres",
    type: "postgres",
    environment: "local",
    read_only: false,
    host: "localhost",
    port: "5432",
    user: "postgres",
    db_name: "analytics",
    save_password: false,
    created_at: "2026-01-01T00:00:00Z",
  };

  const mockTables: TableSchema[] = [
    {
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
          name: "email",
          type: "string",
          nullable: false,
          is_primary_key: false,
          is_foreign_key: false,
        },
      ],
      relations: [],
    },
  ];

  const defaultProps = {
    connection: mockConnection,
    tables: mockTables,
    initialQuery: "SELECT * FROM users LIMIT 50;",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe("Query execution (Run button & shortcut)", () => {
    it("executes query when clicking Run statement button", async () => {
      vi.mocked(api.executeRawQuery).mockResolvedValueOnce({
        columns: ["id", "email"],
        rows: [{ id: 1, email: "alice@example.com" }],
        is_mutation: false,
        rows_affected: 0,
        execution_time_ms: 15,
      });

      const user = userEvent.setup();
      renderWithProviders(<QueryConsole {...defaultProps} />);

      const runButton = screen.getByRole("button", { name: /Run statement/i });
      expect(runButton).toBeInTheDocument();
      expect(runButton).toBeEnabled();

      await user.click(runButton);

      await waitFor(() => {
        expect(api.executeRawQuery).toHaveBeenCalledWith(
          "conn-query-test",
          "SELECT * FROM users LIMIT 50",
          expect.anything(),
        );
      });
    });

    it("triggers query execution via Ctrl+Enter shortcut command event", async () => {
      vi.mocked(api.executeRawQuery).mockResolvedValueOnce({
        columns: ["id", "email"],
        rows: [{ id: 2, email: "bob@example.com" }],
        is_mutation: false,
        rows_affected: 0,
        execution_time_ms: 8,
      });

      renderWithProviders(<QueryConsole {...defaultProps} />);

      // Dispatch the standard workspace command event that maps to Ctrl+Enter
      window.dispatchEvent(
        new CustomEvent("pb:query-command", {
          detail: { tabId: "tab-1", command: "run" },
        }),
      );

      await waitFor(() => {
        expect(api.executeRawQuery).toHaveBeenCalledWith(
          "conn-query-test",
          "SELECT * FROM users LIMIT 50",
          expect.anything(),
        );
      });
    });
  });

  describe("Loading spinner & Query Cancellation", () => {
    it("displays loading spinner and enables Cancel button while query runs", async () => {
      let resolveQuery: (val: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolveQuery = resolve;
      });
      vi.mocked(api.executeRawQuery).mockImplementation(
        () => pendingPromise as any,
      );

      const user = userEvent.setup();
      renderWithProviders(<QueryConsole {...defaultProps} />);

      const runButton = screen.getByRole("button", { name: /Run statement/i });
      await user.click(runButton);

      // Verify running state: button shows loading text/spinner and is disabled
      expect(screen.getByText(/Running...|Đang chạy.../i)).toBeInTheDocument();
      expect(runButton).toBeDisabled();

      // Verify Cancel button appears and is clickable
      const cancelButton = screen.getByRole("button", { name: /Cancel|Hủy/i });
      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton).toBeEnabled();

      // Click Cancel button
      await user.click(cancelButton);

      // Should exit running state
      expect(screen.queryByRole("button", { name: /Cancel|Hủy/i })).toBeNull();
      expect(
        screen.getByRole("button", { name: /Run statement/i }),
      ).toBeEnabled();

      // Resolve the original promise to prevent unhandled rejections
      resolveQuery!({
        columns: [],
        rows: [],
        is_mutation: false,
        rows_affected: 0,
        execution_time_ms: 1,
      });
    });
  });

  describe("Rendering result sets or pinpointing syntax errors", () => {
    it("renders tabular result set in data table when query succeeds", async () => {
      vi.mocked(api.executeRawQuery).mockResolvedValueOnce({
        columns: ["id", "email"],
        rows: [
          { id: 101, email: "charlie@pebblebase.io" },
          { id: 102, email: "dana@pebblebase.io" },
        ],
        is_mutation: false,
        rows_affected: 0,
        execution_time_ms: 12,
      });

      const user = userEvent.setup();
      renderWithProviders(<QueryConsole {...defaultProps} />);

      const runButton = screen.getByRole("button", { name: /Run statement/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText("charlie@pebblebase.io")).toBeInTheDocument();
        expect(screen.getByText("dana@pebblebase.io")).toBeInTheDocument();
      });
    });

    it("pinpoints syntax errors with line/column coordinates in the error alert", async () => {
      const syntaxErrorMessage =
        "syntax error at or near 'FORM' (line 1, column 15)";
      vi.mocked(api.executeRawQuery).mockRejectedValueOnce(
        new Error(syntaxErrorMessage),
      );

      const user = userEvent.setup();
      renderWithProviders(<QueryConsole {...defaultProps} />);

      const runButton = screen.getByRole("button", { name: /Run statement/i });
      await user.click(runButton);

      await waitFor(() => {
        const errorAlert = screen.getByRole("alert");
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent("syntax error at or near 'FORM'");
        expect(errorAlert).toHaveTextContent("line 1, column 15");
      });
    });

    it("intercepts hazardous DELETE query with safety confirmation modal", async () => {
      vi.mocked(api.executeRawQuery).mockResolvedValueOnce({
        columns: [],
        rows: [],
        is_mutation: true,
        rows_affected: 5,
        execution_time_ms: 10,
      });

      const user = userEvent.setup();
      renderWithProviders(
        <QueryConsole {...defaultProps} initialQuery="DELETE FROM users;" />,
      );

      const runButton = screen.getByRole("button", { name: /Run statement/i });
      await user.click(runButton);

      // Verify modal is shown and executeRawQuery has NOT been called yet
      const modal = await screen.findByTestId("hazardous-query-modal");
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveTextContent("Hazardous Query Warning");
      expect(api.executeRawQuery).not.toHaveBeenCalled();

      // Click Confirm & Run
      const confirmButton = screen.getByTestId("confirm-hazardous-run");
      await user.click(confirmButton);

      // Query should now be executed
      await waitFor(() => {
        expect(api.executeRawQuery).toHaveBeenCalledWith(
          "conn-query-test",
          "DELETE FROM users",
          expect.anything(),
        );
      });
    });
  });
});
