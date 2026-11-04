import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupPageEnvironment, dismissWelcomeIfVisible } from "./test-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedDbPath = path.resolve(__dirname, "../../testdata/e2e_seed.db");

test.describe("Flow 1: Connection Lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnvironment(page);
  });

  test("creates, tests, saves, and safely deletes SQLite connection", async ({ page }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Open New Connection Modal
    const newConnBtn = page.getByRole("button", { name: /New connection/i }).first();
    await expect(newConnBtn).toBeVisible({ timeout: 15000 });
    await newConnBtn.click();

    // 2. Select SQLite Database Engine
    const engineSelectTrigger = page.locator('[data-slot="select-trigger"]').first();
    await expect(engineSelectTrigger).toBeVisible();
    await engineSelectTrigger.click();

    const sqliteOption = page.getByRole("option", { name: /SQLite/i });
    await expect(sqliteOption).toBeVisible();
    await sqliteOption.click();

    // 3. Fill Connection Parameters
    const filepathInput = page.locator("#connection-filepath");
    await expect(filepathInput).toBeVisible();
    await filepathInput.fill(seedDbPath);

    const nameInput = page.locator("#connection-name");
    await nameInput.fill("Lifecycle SQLite");

    // 4. Test Connection
    const testBtn = page.getByRole("button", { name: /Test connection/i });
    await expect(testBtn).toBeVisible();
    await testBtn.click();

    // Verify test connection success feedback
    const statusAlert = page.locator('[role="alert"]');
    await expect(statusAlert).toBeVisible({ timeout: 10000 });
    await expect(statusAlert).toContainText(/connected|successful/i);

    // 5. Save Connection
    const saveBtn = page.getByRole("button", { name: /Save connection/i });
    await saveBtn.click();

    // Verify modal closes and connection appears in sidebar tree
    await expect(filepathInput).not.toBeVisible();
    const connTreeItem = page.getByRole("treeitem", { name: /Lifecycle SQLite/i });
    await expect(connTreeItem).toBeVisible({ timeout: 10000 });

    // 6. Delete Connection with Safety Confirmation
    // Right-click connection node to open context menu and trigger delete
    await connTreeItem.click({ button: "right" });
    const removeMenuItem = page.getByRole("menuitem", { name: /Remove connection|Delete connection/i });
    await expect(removeMenuItem).toBeVisible();
    await removeMenuItem.click();

    // Confirmation dialog opens
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();

    const confirmInput = alertDialog.getByRole("textbox");
    const confirmDeleteBtn = alertDialog.getByRole("button", { name: /Delete connection|Xóa kết nối/i });

    // Typing mismatched name keeps delete disabled
    await confirmInput.fill("Wrong Connection Name");
    await expect(confirmDeleteBtn).toBeDisabled();

    // Typing exact name enables delete action
    await confirmInput.fill("Lifecycle SQLite");
    await expect(confirmDeleteBtn).toBeEnabled();

    // Execute deletion
    await confirmDeleteBtn.click();

    // Verify removed from sidebar tree
    await expect(alertDialog).not.toBeVisible();
    await expect(page.getByRole("treeitem", { name: /Lifecycle SQLite/i })).not.toBeVisible({ timeout: 5000 });
  });
});
