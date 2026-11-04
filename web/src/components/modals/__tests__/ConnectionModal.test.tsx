import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionModal } from "../ConnectionModal";
import { renderWithProviders } from "@/test/test-utils";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    testConnection: vi.fn(),
  };
});

describe("ConnectionModal Component", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue({}),
    cloneData: null,
    editData: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Form validation & input fields", () => {
    it("renders default form parameters for PostgreSQL", () => {
      renderWithProviders(<ConnectionModal {...defaultProps} />);

      const hostInput = document.getElementById(
        "connection-host",
      ) as HTMLInputElement;
      const portInput = document.getElementById(
        "connection-port",
      ) as HTMLInputElement;
      const dbInput = document.getElementById(
        "connection-database",
      ) as HTMLInputElement;
      const userInput = document.getElementById(
        "connection-user",
      ) as HTMLInputElement;

      expect(hostInput).toBeInTheDocument();
      expect(hostInput.value).toBe("localhost");
      expect(hostInput.required).toBe(true);

      expect(portInput).toBeInTheDocument();
      expect(portInput.value).toBe("5432");
      expect(portInput.required).toBe(true);

      expect(dbInput).toBeInTheDocument();
      expect(dbInput.value).toBe("pebble_test");
      expect(dbInput.required).toBe(true);

      expect(userInput).toBeInTheDocument();
      expect(userInput.value).toBe("pebble");
    });

    it("fails HTML5 validity check when required host is empty", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ConnectionModal {...defaultProps} />);

      const hostInput = document.getElementById(
        "connection-host",
      ) as HTMLInputElement;
      await user.clear(hostInput);

      expect(hostInput.value).toBe("");
      expect(hostInput.checkValidity()).toBe(false);
    });

    it("successfully submits with valid form inputs", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue({});
      renderWithProviders(
        <ConnectionModal {...defaultProps} onSubmit={onSubmit} />,
      );

      const hostInput = document.getElementById(
        "connection-host",
      ) as HTMLInputElement;
      await user.clear(hostInput);
      await user.type(hostInput, "127.0.0.1");

      const submitButton = screen.getByRole("button", {
        name: /Save Connection|Lưu kết nối/i,
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            host: "127.0.0.1",
            type: "postgres",
            mode: "form",
          }),
        );
      });
    });
  });

  describe("Tab switching (Form Parameters <-> Connection URL)", () => {
    it("toggles between Form Parameters and Connection URL tabs", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ConnectionModal {...defaultProps} />);

      // Initially in form mode
      expect(document.getElementById("connection-host")).toBeInTheDocument();
      expect(document.getElementById("connection-rawURL")).toBeNull();

      // Switch to Connection URL tab
      const urlTab = screen.getByRole("tab", {
        name: /Connection URL|URL kết nối/i,
      });
      await user.click(urlTab);

      // Now raw URL textarea should be visible and form inputs hidden
      expect(document.getElementById("connection-rawURL")).toBeInTheDocument();
      expect(document.getElementById("connection-host")).toBeNull();

      // Switch back to Form Parameters
      const formTab = screen.getByRole("tab", {
        name: /Form Parameters|Thông số biểu mẫu/i,
      });
      await user.click(formTab);

      expect(document.getElementById("connection-host")).toBeInTheDocument();
      expect(document.getElementById("connection-rawURL")).toBeNull();
    });
  });

  describe("Read-Only Connection & Environment Tiers", () => {
    it("toggles Read-Only mode manually", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ConnectionModal {...defaultProps} />);

      const readOnlyCheckbox = document.getElementById(
        "readOnlyMode",
      ) as HTMLInputElement;
      expect(readOnlyCheckbox).toBeInTheDocument();
      expect(readOnlyCheckbox.checked).toBe(false);

      await user.click(readOnlyCheckbox);
      expect(readOnlyCheckbox.checked).toBe(true);

      await user.click(readOnlyCheckbox);
      expect(readOnlyCheckbox.checked).toBe(false);
    });

    it("automatically sets Read-Only to true when switching to Production environment tier", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ConnectionModal {...defaultProps} />);

      const readOnlyCheckbox = document.getElementById(
        "readOnlyMode",
      ) as HTMLInputElement;
      expect(readOnlyCheckbox.checked).toBe(false);

      // Click Production tier tab
      const prodTab = screen.getByRole("tab", { name: /Production|Sản xuất/i });
      await user.click(prodTab);

      // Read-Only mode must automatically be activated
      expect(readOnlyCheckbox.checked).toBe(true);
    });

    it("allows switching between different environment tiers", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue({});
      renderWithProviders(
        <ConnectionModal {...defaultProps} onSubmit={onSubmit} />,
      );

      const stagingTab = screen.getByRole("tab", { name: /Staging/i });
      await user.click(stagingTab);

      const submitButton = screen.getByRole("button", {
        name: /Save Connection|Lưu kết nối/i,
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            environment: "staging",
          }),
        );
      });
    });
  });

  describe("Test Connection button & latency results", () => {
    it("triggers loading indicator and displays latency results on success", async () => {
      let resolvePromise: (val: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(api.testConnection).mockImplementation(() => promise as any);

      const user = userEvent.setup();
      renderWithProviders(<ConnectionModal {...defaultProps} />);

      const testButton = screen.getByRole("button", {
        name: /Test Connection|Kiểm tra kết nối/i,
      });
      await user.click(testButton);

      // Test button should enter loading state
      expect(
        screen.getByText(/Testing...|Đang kiểm tra.../i),
      ).toBeInTheDocument();
      expect(testButton).toBeDisabled();

      // Resolve the test connection call
      resolvePromise!({ status: "ok" });

      await waitFor(() => {
        // Success alert should be displayed with latency information
        expect(
          screen.queryByText(/Testing...|Đang kiểm tra.../i),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/successful|thành công/i)).toBeInTheDocument();
      });
    });

    it("displays error message when connection test fails", async () => {
      vi.mocked(api.testConnection).mockRejectedValueOnce(
        new Error("Connection refused on port 5432"),
      );

      const user = userEvent.setup();
      renderWithProviders(<ConnectionModal {...defaultProps} />);

      const testButton = screen.getByRole("button", {
        name: /Test Connection|Kiểm tra kết nối/i,
      });
      await user.click(testButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Connection refused on port 5432/i),
        ).toBeInTheDocument();
      });
    });
  });
});
