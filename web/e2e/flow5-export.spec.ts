import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { setupPageEnvironment, dismissWelcomeIfVisible } from "./test-helpers";

test.describe("Flow 5: Data Export CSV/JSON", () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnvironment(page);
  });

  test("exports table data to CSV and verifies downloaded content", async ({ page }) => {
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

    // 3. Open "products" table in DataGrid
    const productsNode = page.getByRole("treeitem", { name: /products/i });
    await expect(productsNode).toBeVisible({ timeout: 10000 });
    await productsNode.click();

    // 4. Wait for DataGrid to render
    const gridContainer = page.locator('[data-tour="datagrid-view"]');
    await expect(gridContainer).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("SKU-0001").first()).toBeVisible({ timeout: 10000 });

    // 5. Trigger CSV Export from Toolbar
    const exportDropdownBtn = page.getByRole("button", { name: /Export|Xuất/i });
    await expect(exportDropdownBtn).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await exportDropdownBtn.click();

    const csvMenuItem = page.getByRole("menuitem", { name: /^CSV$/i });
    await expect(csvMenuItem).toBeVisible();
    await csvMenuItem.click();

    // 6. Verify download completion
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("products.csv");

    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    // 7. Inspect CSV content
    const csvContent = fs.readFileSync(filePath!, "utf-8");
    const lines = csvContent.trim().split("\n");

    // Check header columns
    expect(lines[0]).toContain("sku");
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("price");

    // Check records count (> 20 rows of products)
    expect(lines.length).toBeGreaterThan(20);
    expect(csvContent).toContain("SKU-0001");
  });
});
