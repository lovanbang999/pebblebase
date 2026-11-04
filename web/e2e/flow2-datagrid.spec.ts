import { test, expect } from "@playwright/test";
import { setupPageEnvironment, dismissWelcomeIfVisible } from "./test-helpers";

test.describe("Flow 2: DataGrid Inline Editing & Staging", () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnvironment(page);
  });

  test("virtualizes 500+ rows, edits cell inline, verifies staging dirty highlight and submits changes", async ({ page }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Expand "E2E Seed SQLite" in the sidebar tree
    const connNode = page.getByRole("treeitem", { name: /E2E Seed SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    // 2. Expand "Tables" folder
    const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
    await expect(tablesFolder).toBeVisible({ timeout: 10000 });
    await tablesFolder.click();

    // 3. Click "users" table to open in DataGrid workspace tab
    const usersTableNode = page.getByRole("treeitem", { name: /users/i });
    await expect(usersTableNode).toBeVisible({ timeout: 10000 });
    await usersTableNode.click();

    // 4. Wait for DataGrid to render
    const gridContainer = page.locator('[data-tour="datagrid-view"]');
    await expect(gridContainer).toBeVisible({ timeout: 15000 });

    // Verify row 1 is initially visible
    await expect(page.getByText("User 1").first()).toBeVisible({ timeout: 10000 });

    // 5. Set page size to 500 to enable 500-row virtualization in single container
    const perPageTrigger = page.locator('[aria-label="Per page:"]');
    if (await perPageTrigger.isVisible()) {
      await perPageTrigger.click();
      const option500 = page.getByRole("option", { name: /500/i });
      await expect(option500).toBeVisible();
      await option500.click();
    }

    // Scroll virtualized container down towards row 500
    await gridContainer.evaluate((el) => {
      el.scrollTop = 500 * 35;
    });

    // Locate target virtual row 500
    const targetCell = page.getByText("User 500");
    await expect(targetCell).toBeVisible({ timeout: 10000 });

    // 6. Double-click to start inline cell editing
    await targetCell.dblclick();

    const cellInput = page.locator('[data-cell-editing="true"] input');
    await expect(cellInput).toBeVisible({ timeout: 5000 });
    await cellInput.fill("Pebblebase Updated");
    await cellInput.press("Enter");

    // Ensure cell exited editing mode
    await expect(cellInput).not.toBeVisible({ timeout: 5000 });

    // 7. Verify dirty draft state highlighting (pending marker)
    const pendingMarker = page.locator('[aria-label="Pending change"]').first();
    await expect(pendingMarker).toBeVisible({ timeout: 5000 });

    const submitBtn = page.getByRole("button", { name: /^Submit$/i });
    await expect(submitBtn).toBeEnabled();

    // 8. Submit staged changes
    await submitBtn.click();

    // Verify draft marker disappears and cell displays persisted value
    await expect(pendingMarker).not.toBeVisible({ timeout: 10000 });

    // Scroll back to row 500 after table refresh to verify persisted data
    await gridContainer.evaluate((el) => {
      el.scrollTop = 500 * 35;
    });

    await expect(page.getByText("Pebblebase Updated").first()).toBeVisible({ timeout: 10000 });
  });
});
