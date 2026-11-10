import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowModal } from "../RowModal";
import { renderWithProviders } from "@/test/test-utils";
import type { TableSchema } from "@/lib/types";

describe("RowModal Characterization Tests", () => {
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
        name: "bio",
        type: "string",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "age",
        type: "int",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "score",
        type: "float",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "is_active",
        type: "bool",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "preferences",
        type: "json",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "created_at",
        type: "datetime",
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
    table: mockTable,
    initialRow: null,
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getFieldContainer(columnName: string) {
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((l) =>
      l.textContent?.trim().includes(columnName),
    );
    if (!label) throw new Error(`Label for column '${columnName}' not found`);
    const fieldContainer = label.closest(".space-y-1");
    if (!fieldContainer)
      throw new Error(`Container for column '${columnName}' not found`);
    return fieldContainer as HTMLElement;
  }

  function getFieldInput(columnName: string) {
    const fieldContainer = getFieldContainer(columnName);
    const input = fieldContainer.querySelector(
      "input, textarea, button[data-slot='select-trigger'], button[role='combobox']",
    );
    if (!input) throw new Error(`Input for column '${columnName}' not found`);
    return input as HTMLElement;
  }

  // ===========================================================================
  // 1. Rendering: Insert Mode vs Edit Mode
  // ===========================================================================
  describe("Rendering modes", () => {
    it("renders in Insert mode with empty fields, Add New Record title, and Insert Record button", () => {
      renderWithProviders(<RowModal {...defaultProps} />);

      // Title & Table badge
      expect(screen.getByText("Add New Record")).toBeInTheDocument();
      expect(screen.getByText("users")).toBeInTheDocument();

      // Submit button text
      expect(
        screen.getByRole("button", { name: "Insert Record" }),
      ).toBeInTheDocument();

      // Delete button must NOT be present in insert mode
      expect(
        screen.queryByRole("button", { name: "Delete" }),
      ).not.toBeInTheDocument();

      // PK field is empty and enabled
      const idInput = getFieldInput("id") as HTMLInputElement;
      expect(idInput.value).toBe("");
      expect(idInput.disabled).toBe(false);
    });

    it("renders in Edit mode with populated fields, Edit Record title, disabled PK, and Delete button", () => {
      const initialRow = {
        id: 42,
        username: "ada_lovelace",
        bio: "First programmer",
        age: 36,
        score: 99.5,
        is_active: true,
        preferences: { theme: "dark" },
        created_at: "2026-01-01T10:00:00Z",
      };

      renderWithProviders(
        <RowModal {...defaultProps} initialRow={initialRow} />,
      );

      // Title & Table badge
      expect(screen.getByText("Edit Record")).toBeInTheDocument();
      expect(screen.getByText("users")).toBeInTheDocument();

      // Submit button text
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).toBeInTheDocument();

      // Delete button must be present in edit mode when onDelete is provided
      expect(
        screen.getByRole("button", { name: "Delete" }),
      ).toBeInTheDocument();

      // Primary key field is populated and disabled
      const idInput = getFieldInput("id") as HTMLInputElement;
      expect(idInput.value).toBe("42");
      expect(idInput.disabled).toBe(true);

      // Non-PK fields populated
      const usernameInput = getFieldInput("username") as HTMLInputElement;
      expect(usernameInput.value).toBe("ada_lovelace");
      expect(usernameInput.disabled).toBe(false);

      const bioInput = getFieldInput("bio") as HTMLInputElement;
      expect(bioInput.value).toBe("First programmer");

      const ageInput = getFieldInput("age") as HTMLInputElement;
      expect(ageInput.value).toBe("36");

      const scoreInput = getFieldInput("score") as HTMLInputElement;
      expect(scoreInput.value).toBe("99.5");
    });
  });

  // ===========================================================================
  // 2. Input Types Present (text, number, bool select, json textarea, datetime)
  // ===========================================================================
  describe("Input types and controls", () => {
    it("renders text input for string columns and accepts text input", async () => {
      const user = userEvent.setup();
      renderWithProviders(<RowModal {...defaultProps} />);

      const usernameInput = getFieldInput("username") as HTMLInputElement;
      expect(usernameInput.tagName).toBe("INPUT");
      expect(usernameInput.type).toBe("text");

      await user.type(usernameInput, "new_user_123");
      expect(usernameInput.value).toBe("new_user_123");
    });

    it("renders NumberInput for int and float columns and supports typing and stepper controls", async () => {
      const user = userEvent.setup();
      renderWithProviders(<RowModal {...defaultProps} />);

      // Int input
      const ageInput = getFieldInput("age") as HTMLInputElement;
      expect(ageInput.tagName).toBe("INPUT");
      expect(ageInput.type).toBe("number");
      await user.type(ageInput, "25");
      expect(ageInput.value).toBe("25");

      // Stepper buttons for age
      const ageContainer = getFieldContainer("age");
      const increaseBtn = within(ageContainer).getByTitle("Increase (+)");
      const decreaseBtn = within(ageContainer).getByTitle("Decrease (-)");
      await user.click(increaseBtn);
      expect(ageInput.value).toBe("26");
      await user.click(decreaseBtn);
      expect(ageInput.value).toBe("25");

      // Float input
      const scoreInput = getFieldInput("score") as HTMLInputElement;
      expect(scoreInput.type).toBe("number");
      expect(scoreInput.step).toBe("any");
      await user.type(scoreInput, "88.75");
      expect(scoreInput.value).toBe("88.75");
    });

    it("renders boolean Select dropdown with options and updates selection", async () => {
      const user = userEvent.setup();
      renderWithProviders(<RowModal {...defaultProps} />);

      const selectTrigger = getFieldInput("is_active");
      expect(selectTrigger).toBeInTheDocument();

      // Open select dropdown
      await user.click(selectTrigger);

      // Options must be visible
      const trueOption = await screen.findByRole("option", { name: "true" });
      const falseOption = screen.getByRole("option", { name: "false" });
      const nullOption = screen.getByRole("option", {
        name: /(null \/ default)|\(trống \/ mặc định\)/i,
      });

      expect(trueOption).toBeInTheDocument();
      expect(falseOption).toBeInTheDocument();
      expect(nullOption).toBeInTheDocument();

      // Select 'true'
      await user.click(trueOption);
      expect(selectTrigger.textContent).toContain("true");
    });

    it("renders Textarea for json columns with formatted value", async () => {
      const user = userEvent.setup();
      const initialRow = {
        id: 1,
        username: "test",
        preferences: { notification: true, theme: "light" },
      };

      renderWithProviders(
        <RowModal {...defaultProps} initialRow={initialRow} />,
      );

      const jsonTextarea = getFieldInput("preferences") as HTMLTextAreaElement;
      expect(jsonTextarea.tagName).toBe("TEXTAREA");
      expect(jsonTextarea.value).toContain('"notification": true');
      expect(jsonTextarea.value).toContain('"theme": "light"');

      await user.clear(jsonTextarea);
      fireEvent.change(jsonTextarea, {
        target: { value: '{"theme": "dark"}' },
      });
      expect(jsonTextarea.value).toBe('{"theme": "dark"}');
    });

    it("renders standard text input for datetime column and accepts datetime values", async () => {
      const user = userEvent.setup();
      renderWithProviders(<RowModal {...defaultProps} />);

      const createdAtInput = getFieldInput("created_at") as HTMLInputElement;
      expect(createdAtInput.tagName).toBe("INPUT");
      expect(createdAtInput.type).toBe("text");

      await user.type(createdAtInput, "2026-11-10 09:30:00");
      expect(createdAtInput.value).toBe("2026-11-10 09:30:00");
    });
  });

  // ===========================================================================
  // 3. Primary Key Disabled in Edit Mode
  // ===========================================================================
  describe("Primary key immutability in edit mode", () => {
    it("leaves primary key input enabled in insert mode", () => {
      renderWithProviders(<RowModal {...defaultProps} />);
      const idInput = getFieldInput("id") as HTMLInputElement;
      expect(idInput.disabled).toBe(false);
    });

    it("disables primary key input in edit mode", () => {
      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={{ id: 99, username: "admin" }}
        />,
      );
      const idInput = getFieldInput("id") as HTMLInputElement;
      expect(idInput.disabled).toBe(true);
    });
  });

  // ===========================================================================
  // 4. Required / Nullable Fields
  // ===========================================================================
  describe("Required and nullable field indications", () => {
    it("displays 'Nullable' tag for nullable columns and omits it for required columns", () => {
      renderWithProviders(<RowModal {...defaultProps} />);

      const idContainer = getFieldContainer("id");
      expect(
        within(idContainer).queryByText(/nullable/i),
      ).not.toBeInTheDocument();

      const usernameContainer = getFieldContainer("username");
      expect(
        within(usernameContainer).queryByText(/nullable/i),
      ).not.toBeInTheDocument();

      const bioContainer = getFieldContainer("bio");
      expect(within(bioContainer).getByText(/nullable/i)).toBeInTheDocument();

      const ageContainer = getFieldContainer("age");
      expect(within(ageContainer).getByText(/nullable/i)).toBeInTheDocument();
    });

    it("submits null for empty nullable fields", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<RowModal {...defaultProps} onSave={onSave} />);

      // Fill required fields
      await user.type(getFieldInput("id"), "1");
      await user.type(getFieldInput("username"), "charlie");
      // Leave bio and age empty

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const payload = onSave.mock.calls[0][0];
      expect(payload.id).toBe(1);
      expect(payload.username).toBe("charlie");
      expect(payload.bio).toBeNull();
      expect(payload.age).toBeNull();
      expect(payload.score).toBeNull();
    });
  });

  // ===========================================================================
  // 5. Dynamic Document Fields Support
  // ===========================================================================
  describe("Dynamic document fields", () => {
    it("allows adding and removing dynamic key-value fields", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<RowModal {...defaultProps} onSave={onSave} />);

      // Initially no dynamic fields
      expect(screen.queryByText(/Dynamic Fields/i)).not.toBeInTheDocument();

      // Click Add Dynamic Field
      const addDynamicBtn = screen.getByRole("button", {
        name: /Add dynamic field/i,
      });
      await user.click(addDynamicBtn);

      // Inline input form appears
      const nameInput = screen.getByPlaceholderText(/Field name/i);
      const valInput = screen.getByPlaceholderText(/Value/i);
      const addConfirmBtn = screen.getByRole("button", { name: "Add" });

      expect(addConfirmBtn).toBeDisabled();

      await user.type(nameInput, "custom_tag");
      expect(addConfirmBtn).toBeEnabled();
      fireEvent.change(valInput, {
        target: { value: '{"tier": "gold"}' },
      });
      await user.click(addConfirmBtn);

      // Dynamic field now rendered with tag and remove button
      expect(screen.getByText("custom_tag")).toBeInTheDocument();
      expect(screen.getByText("dynamic")).toBeInTheDocument();

      // Fill required fields and submit
      await user.type(getFieldInput("id"), "10");
      await user.type(getFieldInput("username"), "tagged_user");
      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const payload = onSave.mock.calls[0][0];
      expect(payload.custom_tag).toEqual({ tier: "gold" });
    });

    it("removes dynamic field when trash button is clicked", async () => {
      const user = userEvent.setup();
      const initialRow = {
        id: 1,
        username: "user1",
        extra_info: "temporary note",
      };

      renderWithProviders(
        <RowModal {...defaultProps} initialRow={initialRow} />,
      );

      expect(screen.getByText("extra_info")).toBeInTheDocument();
      const removeBtn = screen.getByTitle(/Remove field/i);
      await user.click(removeBtn);

      expect(screen.queryByText("extra_info")).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 6. Submit Success & Payloads (Insert & Edit with Diff Modal)
  // ===========================================================================
  describe("Submit success & payload parsing", () => {
    it("submits parsed types in Insert mode and calls onClose", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      renderWithProviders(
        <RowModal {...defaultProps} onSave={onSave} onClose={onClose} />,
      );

      await user.type(getFieldInput("id"), "50");
      await user.type(getFieldInput("username"), "bob");
      await user.type(getFieldInput("age"), "40");
      await user.type(getFieldInput("score"), "77.5");

      // Select boolean
      await user.click(getFieldInput("is_active"));
      await user.click(await screen.findByRole("option", { name: "true" }));

      // JSON input
      fireEvent.change(getFieldInput("preferences"), {
        target: { value: '{"email_opt_in": false}' },
      });

      // Datetime input
      await user.type(getFieldInput("created_at"), "2026-11-10T12:00:00Z");

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      expect(onSave).toHaveBeenCalledWith({
        id: 50,
        username: "bob",
        bio: null,
        age: 40,
        score: 77.5,
        is_active: true,
        preferences: { email_opt_in: false },
        created_at: "2026-11-10T12:00:00Z",
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("opens Diff Confirmation modal in Edit mode when values change, and submits on confirmation", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      const initialRow = {
        id: 1,
        username: "original_name",
        age: 20,
      };

      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={initialRow}
          onSave={onSave}
          onClose={onClose}
        />,
      );

      // Modify username and age
      const usernameInput = getFieldInput("username");
      await user.clear(usernameInput);
      await user.type(usernameInput, "modified_name");

      const ageInput = getFieldInput("age");
      await user.clear(ageInput);
      await user.type(ageInput, "21");

      // Click Save Changes -> triggers Diff modal
      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      // Diff modal displayed
      expect(await screen.findByText("Review Changes")).toBeInTheDocument();
      expect(screen.getByText("original_name")).toBeInTheDocument();
      expect(screen.getByText("modified_name")).toBeInTheDocument();

      // onSave should not have been called yet
      expect(onSave).not.toHaveBeenCalled();

      // Click Confirm Save in Diff modal
      const confirmSaveBtn = screen.getByRole("button", {
        name: "Confirm & Save",
      });
      await user.click(confirmSaveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const payload = onSave.mock.calls[0][0];
      expect(payload.username).toBe("modified_name");
      expect(payload.age).toBe(21);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("submits directly without diff modal when no changes were made in Edit mode", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      const initialRow = { id: 1, username: "no_changes", age: 30 };

      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={initialRow}
          onSave={onSave}
          onClose={onClose}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      // Diff modal was bypassed
      expect(screen.queryByText("Review Changes")).not.toBeInTheDocument();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 7. Submit Failure & Error Alert
  // ===========================================================================
  describe("Submit failure handling", () => {
    it("displays error Alert and keeps modal open when onSave rejects", async () => {
      const user = userEvent.setup();
      const onSave = vi
        .fn()
        .mockRejectedValue(
          new Error("UNIQUE constraint failed: users.username"),
        );
      const onClose = vi.fn();
      renderWithProviders(
        <RowModal {...defaultProps} onSave={onSave} onClose={onClose} />,
      );

      await user.type(getFieldInput("id"), "1");
      await user.type(getFieldInput("username"), "duplicate_user");
      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      // Error alert displayed
      expect(
        await screen.findByText(/UNIQUE constraint failed: users\.username/i),
      ).toBeInTheDocument();

      // Modal is still open: onClose was NOT called
      expect(onClose).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Insert Record" }),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 8. Cancel / Close Actions
  // ===========================================================================
  describe("Cancel and close actions", () => {
    it("invokes onClose when Cancel button in modal footer is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderWithProviders(<RowModal {...defaultProps} onClose={onClose} />);

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelBtn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("cancels Diff modal without saving or closing main modal", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const onClose = vi.fn();
      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={{ id: 1, username: "before" }}
          onSave={onSave}
          onClose={onClose}
        />,
      );

      const usernameInput = getFieldInput("username");
      await user.clear(usernameInput);
      await user.type(usernameInput, "after");
      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      expect(await screen.findByText("Review Changes")).toBeInTheDocument();

      // Click Cancel in Diff modal (last Cancel button in document)
      const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
      const diffCancelBtn = cancelButtons[cancelButtons.length - 1];
      await user.click(diffCancelBtn);

      // Diff modal dismissed, onSave and onClose not called
      await waitFor(() => {
        expect(screen.queryByText("Review Changes")).not.toBeInTheDocument();
      });
      expect(onSave).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 9. Delete Record in Edit Mode
  // ===========================================================================
  describe("Delete record behavior", () => {
    it("does not render Delete button if onDelete prop is not provided", () => {
      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={{ id: 1, username: "user" }}
          onDelete={undefined}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Delete" }),
      ).not.toBeInTheDocument();
    });

    it("opens confirmation dialog on Delete click, executes onDelete on confirmation, and calls onClose", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={{ id: 1, username: "delete_me" }}
          onDelete={onDelete}
          onClose={onClose}
        />,
      );

      const deleteBtn = screen.getByRole("button", { name: "Delete" });
      await user.click(deleteBtn);

      // Confirmation dialog appears
      expect(
        await screen.findByText(/Are you sure you want to delete this record/i),
      ).toBeInTheDocument();

      // Confirm Delete action button
      const confirmDeleteBtn = screen.getByRole("button", {
        name: "Delete Record",
      });
      await user.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(onDelete).toHaveBeenCalledTimes(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("displays error alert if onDelete rejects", async () => {
      const user = userEvent.setup();
      const onDelete = vi
        .fn()
        .mockRejectedValue(new Error("Cannot delete due to foreign key"));
      const onClose = vi.fn();

      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={{ id: 1, username: "user" }}
          onDelete={onDelete}
          onClose={onClose}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getByRole("button", { name: "Delete Record" }));

      expect(
        await screen.findByText(/Cannot delete due to foreign key/i),
      ).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 10. Busy State / Double Submit Prevention
  // ===========================================================================
  describe("Busy state & double submit prevention", () => {
    it("disables submit, cancel, and delete buttons while saving is in progress", async () => {
      const user = userEvent.setup();
      let resolveSave: () => void = () => {};
      const onSave = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );

      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={{ id: 1, username: "busy_user" }}
          onSave={onSave}
        />,
      );

      // Submit without changes (direct save)
      const saveBtn = screen.getByRole("button", { name: "Save Changes" });
      await user.click(saveBtn);

      expect(onSave).toHaveBeenCalledTimes(1);

      // While saving, buttons must be disabled
      expect(saveBtn).toBeDisabled();
      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      expect(cancelBtn).toBeDisabled();
      const deleteBtn = screen.getByRole("button", { name: "Delete" });
      expect(deleteBtn).toBeDisabled();

      // Resolve pending save
      resolveSave();
      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===========================================================================
  // 11. Duplicate Row Mode (_isDuplicate)
  // ===========================================================================
  describe("Duplicate row behavior", () => {
    it("renders in Insert mode with cleared and enabled primary key when initialRow has _isDuplicate", () => {
      const duplicateRow = {
        _isDuplicate: true,
        id: 777,
        username: "cloned_user",
        bio: "cloned bio",
        age: 22,
      };

      renderWithProviders(
        <RowModal {...defaultProps} initialRow={duplicateRow} />,
      );

      // Header should show Add New Record, not Edit
      expect(screen.getByText("Add New Record")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Insert Record" }),
      ).toBeInTheDocument();

      // Delete button must NOT be present
      expect(
        screen.queryByRole("button", { name: "Delete" }),
      ).not.toBeInTheDocument();

      // PK must be cleared and enabled
      const idInput = getFieldInput("id") as HTMLInputElement;
      expect(idInput.value).toBe("");
      expect(idInput.disabled).toBe(false);

      // Non-PK fields are pre-populated
      const usernameInput = getFieldInput("username") as HTMLInputElement;
      expect(usernameInput.value).toBe("cloned_user");
    });
  });

  // ===========================================================================
  // 12. State Reset When Remounted / Reopened
  // ===========================================================================
  describe("State reset on reopen", () => {
    it("initializes with fresh values when remounted with new initialRow", () => {
      const { unmount } = renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={{ id: 1, username: "first_user" }}
        />,
      );

      const usernameInput1 = getFieldInput("username") as HTMLInputElement;
      expect(usernameInput1.value).toBe("first_user");
      unmount();

      renderWithProviders(
        <RowModal
          {...defaultProps}
          initialRow={{ id: 2, username: "second_user" }}
        />,
      );

      const usernameInput2 = getFieldInput("username") as HTMLInputElement;
      expect(usernameInput2.value).toBe("second_user");
    });
  });

  // ===========================================================================
  // EXTENDED CHARACTERIZATION TESTS (BATCH 2)
  // Queries strictly use accessible roles, label text, and placeholders.
  // ===========================================================================

  function getControlForColumn(columnName: string) {
    const label = screen.getByText(columnName, { selector: "label" });
    const container = label.parentElement?.parentElement;
    if (!container)
      throw new Error(`Container for column '${columnName}' not found`);
    const input = container.querySelector(
      "input, textarea, button[data-slot='select-trigger'], button[role='combobox']",
    );
    if (!input) throw new Error(`Control for column '${columnName}' not found`);
    return input as HTMLElement;
  }

  // ===========================================================================
  // 13. Per-Type Value Handling (Extended Types & Fallback to Default Branch)
  // ===========================================================================
  describe("Extended per-type value handling", () => {
    const allTypesTable: TableSchema = {
      name: "all_types_table",
      columns: [
        {
          name: "id",
          type: "int",
          nullable: false,
          is_primary_key: true,
          is_foreign_key: false,
        },
        {
          name: "uuid_col",
          type: "uuid",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
        {
          name: "date_col",
          type: "date",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
        {
          name: "timestamp_col",
          type: "timestamp",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
        {
          name: "bigint_col",
          type: "bigint",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
        {
          name: "decimal_col",
          type: "decimal",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
        {
          name: "tags_col",
          type: "text[]",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
      ],
      relations: [],
    };

    it("prefills extended types (uuid, date, timestamp, bigint, decimal, array) into text inputs", () => {
      const initialRow = {
        id: 1,
        uuid_col: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        date_col: "2026-11-10",
        timestamp_col: "2026-11-10T12:00:00Z",
        bigint_col: "9223372036854775807",
        decimal_col: "9999.99",
        tags_col: "tag1, tag2",
      };

      renderWithProviders(
        <RowModal
          {...defaultProps}
          table={allTypesTable}
          initialRow={initialRow}
        />,
      );

      expect((getControlForColumn("uuid_col") as HTMLInputElement).value).toBe(
        "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      );
      expect((getControlForColumn("date_col") as HTMLInputElement).value).toBe(
        "2026-11-10",
      );
      expect(
        (getControlForColumn("timestamp_col") as HTMLInputElement).value,
      ).toBe("2026-11-10T12:00:00Z");
      expect(
        (getControlForColumn("bigint_col") as HTMLInputElement).value,
      ).toBe("9223372036854775807");
      expect(
        (getControlForColumn("decimal_col") as HTMLInputElement).value,
      ).toBe("9999.99");
      expect((getControlForColumn("tags_col") as HTMLInputElement).value).toBe(
        "tag1, tag2",
      );
    });

    it("submits extended types through the default branch as string values", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(
        <RowModal {...defaultProps} table={allTypesTable} onSave={onSave} />,
      );

      await user.type(getControlForColumn("id"), "1");
      await user.type(
        getControlForColumn("uuid_col"),
        "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      );
      await user.type(getControlForColumn("date_col"), "2026-11-10");
      await user.type(
        getControlForColumn("timestamp_col"),
        "2026-11-10T12:00:00Z",
      );
      await user.type(getControlForColumn("bigint_col"), "9223372036854775807");
      await user.type(getControlForColumn("decimal_col"), "9999.99");
      await user.type(getControlForColumn("tags_col"), "alpha, beta");

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          id: 1,
          uuid_col: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          date_col: "2026-11-10",
          timestamp_col: "2026-11-10T12:00:00Z",
          bigint_col: "9223372036854775807",
          decimal_col: "9999.99",
          tags_col: "alpha, beta",
        });
      });
    });

    it("handles zero, negative numbers, false booleans, and empty json objects", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<RowModal {...defaultProps} onSave={onSave} />);

      await user.type(getControlForColumn("id"), "0");
      await user.type(getControlForColumn("username"), "zero_user");
      await user.type(getControlForColumn("age"), "-5");
      await user.type(getControlForColumn("score"), "0.0");

      // Set boolean to false
      await user.click(getControlForColumn("is_active"));
      await user.click(await screen.findByRole("option", { name: "false" }));

      // Set JSON to empty object
      fireEvent.change(getControlForColumn("preferences"), {
        target: { value: "{}" },
      });

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 0,
            username: "zero_user",
            age: -5,
            score: 0,
            is_active: false,
            preferences: {},
          }),
        );
      });
    });
  });

  // ===========================================================================
  // 14. Document / Mongo-style Behavior
  // ===========================================================================
  describe("Document / Mongo-style behavior", () => {
    it("renders auto-generated ObjectId placeholder for _id primary key in insert mode", () => {
      const mongoTable: TableSchema = {
        name: "documents",
        columns: [
          {
            name: "_id",
            type: "string",
            nullable: false,
            is_primary_key: true,
            is_foreign_key: false,
          },
          {
            name: "title",
            type: "string",
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false,
          },
        ],
        relations: [],
      };

      renderWithProviders(<RowModal {...defaultProps} table={mongoTable} />);

      const idInput = screen.getByPlaceholderText(
        "(auto-generated ObjectId if blank)",
      );
      expect(idInput).toBeInTheDocument();
      expect((idInput as HTMLInputElement).disabled).toBe(false);

      const titleInput = getControlForColumn("title");
      expect(titleInput).toBeInTheDocument();
    });

    it("supports schemaless tables with no fixed columns by adding dynamic fields", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const schemalessTable: TableSchema = {
        name: "events",
        columns: [],
        relations: [],
      };

      renderWithProviders(
        <RowModal {...defaultProps} table={schemalessTable} onSave={onSave} />,
      );

      // No schema columns rendered
      expect(screen.queryByText("Nullable")).not.toBeInTheDocument();

      // Click Add Dynamic Field
      const addDynamicBtn = screen.getByRole("button", {
        name: "Add dynamic field to document",
      });
      await user.click(addDynamicBtn);

      const nameInput = screen.getByPlaceholderText("Field name (e.g. sku)");
      const valInput = screen.getByPlaceholderText("Value (or JSON)");
      const confirmAddBtn = screen.getByRole("button", { name: "Add" });

      await user.type(nameInput, "event_type");
      await user.type(valInput, "user_signup");
      await user.click(confirmAddBtn);

      expect(screen.getByText("event_type")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          event_type: "user_signup",
        });
      });
    });

    it("parses nested JSON objects inside dynamic document fields", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<RowModal {...defaultProps} onSave={onSave} />);

      await user.type(getControlForColumn("id"), "1");
      await user.type(getControlForColumn("username"), "doc_user");

      const addDynamicBtn = screen.getByRole("button", {
        name: "Add dynamic field to document",
      });
      await user.click(addDynamicBtn);

      const nameInput = screen.getByPlaceholderText("Field name (e.g. sku)");
      const valInput = screen.getByPlaceholderText("Value (or JSON)");
      const confirmAddBtn = screen.getByRole("button", { name: "Add" });

      await user.type(nameInput, "nested_profile");
      fireEvent.change(valInput, {
        target: {
          value:
            '{"address": {"city": "Hanoi", "country": "Vietnam"}, "tags": ["admin", "dev"]}',
        },
      });
      await user.click(confirmAddBtn);

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 1,
            username: "doc_user",
            nested_profile: {
              address: { city: "Hanoi", country: "Vietnam" },
              tags: ["admin", "dev"],
            },
          }),
        );
      });
    });

    it("overwrites existing value when adding a dynamic field with duplicate key", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<RowModal {...defaultProps} onSave={onSave} />);

      await user.type(getControlForColumn("id"), "1");
      await user.type(getControlForColumn("username"), "dedup_user");

      const addDynamicBtn = screen.getByRole("button", {
        name: "Add dynamic field to document",
      });

      // Add dynamic field "duplicate_key" with value "first_val"
      await user.click(addDynamicBtn);
      await user.type(
        screen.getByPlaceholderText("Field name (e.g. sku)"),
        "duplicate_key",
      );
      await user.type(
        screen.getByPlaceholderText("Value (or JSON)"),
        "first_val",
      );
      await user.click(screen.getByRole("button", { name: "Add" }));

      // Add dynamic field "duplicate_key" with value "second_val"
      await user.click(
        screen.getByRole("button", {
          name: "Add dynamic field to document",
        }),
      );
      await user.type(
        screen.getByPlaceholderText("Field name (e.g. sku)"),
        "duplicate_key",
      );
      await user.type(
        screen.getByPlaceholderText("Value (or JSON)"),
        "second_val",
      );
      await user.click(screen.getByRole("button", { name: "Add" }));

      // Ensure only one dynamic field row is displayed with updated value
      const dynamicLabels = screen.getAllByText("duplicate_key");
      expect(dynamicLabels.length).toBe(1);

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            duplicate_key: "second_val",
          }),
        );
      });
    });
  });

  // ===========================================================================
  // 15. Required Field, Empty String vs Null, and Whitespace Handling
  // ===========================================================================
  describe("Required fields, empty strings vs null, and whitespace", () => {
    const nullableCheckTable: TableSchema = {
      name: "validation_table",
      columns: [
        {
          name: "id",
          type: "int",
          nullable: false,
          is_primary_key: true,
          is_foreign_key: false,
        },
        {
          name: "required_text",
          type: "string",
          nullable: false,
          is_primary_key: false,
          is_foreign_key: false,
        },
        {
          name: "nullable_text",
          type: "string",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
        {
          name: "whitespace_text",
          type: "string",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
      ],
      relations: [],
    };

    it("omits empty required fields from payload without blocking client submit", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(
        <RowModal
          {...defaultProps}
          table={nullableCheckTable}
          onSave={onSave}
        />,
      );

      await user.type(getControlForColumn("id"), "1");
      // required_text is left empty
      // nullable_text is left empty
      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const payload = onSave.mock.calls[0][0];
      expect(payload.id).toBe(1);
      expect("required_text" in payload).toBe(false);
      expect(payload.nullable_text).toBeNull();
    });

    it("preserves raw whitespace instead of trimming or converting to null", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(
        <RowModal
          {...defaultProps}
          table={nullableCheckTable}
          onSave={onSave}
        />,
      );

      await user.type(getControlForColumn("id"), "1");
      await user.type(getControlForColumn("required_text"), "   ");
      await user.type(getControlForColumn("whitespace_text"), "   ");

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          id: 1,
          required_text: "   ",
          nullable_text: null,
          whitespace_text: "   ",
        });
      });
    });
  });

  // ===========================================================================
  // 16. Invalid JSON Handling
  // ===========================================================================
  describe("Invalid JSON handling in json column", () => {
    it("does not block client submit and passes raw invalid JSON string to onSave", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<RowModal {...defaultProps} onSave={onSave} />);

      await user.type(getControlForColumn("id"), "1");
      await user.type(getControlForColumn("username"), "json_user");

      fireEvent.change(getControlForColumn("preferences"), {
        target: { value: "{bad_json: missing_quotes" },
      });

      // Does not block submit on client
      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 1,
            username: "json_user",
            preferences: "{bad_json: missing_quotes",
          }),
        );
      });
    });

    it("renders server error alert when backend rejects invalid JSON payload", async () => {
      const user = userEvent.setup();
      const onSave = vi
        .fn()
        .mockRejectedValue(
          new Error("Database error: invalid JSON syntax at character 1"),
        );
      renderWithProviders(<RowModal {...defaultProps} onSave={onSave} />);

      await user.type(getControlForColumn("id"), "1");
      await user.type(getControlForColumn("username"), "json_user");
      fireEvent.change(getControlForColumn("preferences"), {
        target: { value: "invalid" },
      });

      await user.click(screen.getByRole("button", { name: "Insert Record" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "Database error: invalid JSON syntax at character 1",
      );
    });
  });

  // ===========================================================================
  // 17. Keyboard and Focus Behavior
  // ===========================================================================
  describe("Keyboard and focus behavior", () => {
    it("submits the form when Enter is pressed inside an input field", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<RowModal {...defaultProps} onSave={onSave} />);

      const usernameInput = getControlForColumn("username");
      await user.type(getControlForColumn("id"), "1");
      await user.type(usernameInput, "enter_user{Enter}");

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          username: "enter_user",
        }),
      );
    });

    it("closes the dialog when Escape key is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderWithProviders(<RowModal {...defaultProps} onClose={onClose} />);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("moves focus inside the dialog when opened", async () => {
      renderWithProviders(<RowModal {...defaultProps} />);
      const dialog = await screen.findByRole("dialog");

      await waitFor(() => {
        expect(dialog.contains(document.activeElement)).toBe(true);
      });
    });

    it("returns focus back inside main dialog after diff confirmation dialog closes", async () => {
      const user = userEvent.setup();
      const initialRow = {
        id: 1,
        username: "initial_user",
      };
      renderWithProviders(
        <RowModal {...defaultProps} initialRow={initialRow} />,
      );

      const usernameInput = getControlForColumn("username");
      await user.clear(usernameInput);
      await user.type(usernameInput, "edited_user");

      const saveChangesBtn = screen.getByRole("button", {
        name: "Save Changes",
      });
      await user.click(saveChangesBtn);

      const diffDialog = await screen.findByRole("alertdialog");
      expect(diffDialog).toBeInTheDocument();

      const cancelDiffBtn = within(diffDialog).getByRole("button", {
        name: "Cancel",
      });
      await user.click(cancelDiffBtn);

      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      });

      const mainDialog = screen.getByRole("dialog");
      await waitFor(() => {
        expect(mainDialog.contains(document.activeElement)).toBe(true);
      });
    });
  });

  // ===========================================================================
  // 18. Diff Dialog with Multiple Fields Changed & Removed Dynamic Field
  // ===========================================================================
  describe("Diff dialog with multiple fields and removed dynamic field", () => {
    it("renders changed fields plural badge and lists modifications including dynamic removal", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const initialRow = {
        id: 10,
        username: "alice",
        age: 25,
        bio: "original bio",
        temporary_prop: "value_to_drop",
      };

      renderWithProviders(
        <RowModal {...defaultProps} initialRow={initialRow} onSave={onSave} />,
      );

      // Modify username
      const usernameInput = getControlForColumn("username");
      await user.clear(usernameInput);
      await user.type(usernameInput, "alice_updated");

      // Modify age
      const ageInput = getControlForColumn("age");
      await user.clear(ageInput);
      await user.type(ageInput, "26");

      // Remove dynamic field temporary_prop
      expect(screen.getByText("temporary_prop")).toBeInTheDocument();
      const removeBtn = screen.getByTitle("Remove field");
      await user.click(removeBtn);
      expect(screen.queryByText("temporary_prop")).not.toBeInTheDocument();

      // Trigger Save Changes
      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      // Review Changes AlertDialog appears
      const diffDialog = await screen.findByRole("alertdialog");
      expect(diffDialog).toBeInTheDocument();

      const diffWithin = within(diffDialog);
      expect(diffWithin.getByText("Review Changes")).toBeInTheDocument();
      expect(diffWithin.getByText("3 fields changed")).toBeInTheDocument();

      // Check username row
      expect(diffWithin.getByText("username")).toBeInTheDocument();
      expect(diffWithin.getByText("alice")).toBeInTheDocument();
      expect(diffWithin.getByText("alice_updated")).toBeInTheDocument();

      // Check age row
      expect(diffWithin.getByText("age")).toBeInTheDocument();
      expect(diffWithin.getByText("25")).toBeInTheDocument();
      expect(diffWithin.getByText("26")).toBeInTheDocument();

      // Check temporary_prop row (shows NULL after value)
      expect(diffWithin.getByText("temporary_prop")).toBeInTheDocument();
      expect(diffWithin.getByText("value_to_drop")).toBeInTheDocument();
      expect(diffWithin.getByText("NULL")).toBeInTheDocument();

      // Confirm & Save
      const confirmBtn = diffWithin.getByRole("button", {
        name: "Confirm & Save",
      });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const savedPayload = onSave.mock.calls[0][0];
      expect(savedPayload).toEqual(
        expect.objectContaining({
          id: 10,
          username: "alice_updated",
          age: 26,
          bio: "original bio",
        }),
      );
      expect("temporary_prop" in savedPayload).toBe(false);
    });
  });
});
