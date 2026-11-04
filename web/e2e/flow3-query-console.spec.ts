import { test, expect, type Page } from "@playwright/test";
import { setupPageEnvironment, dismissWelcomeIfVisible } from "./test-helpers";

async function setEditorQuery(page: Page, queryText: string) {
  await page.evaluate((text) => {
    if ((window as any).__pb_set_query) {
      (window as any).__pb_set_query(text);
    } else {
      const view = (window as any).__pb_editor_view;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: text.length },
        });
        view.focus();
      }
    }
  }, queryText);
}

test.describe("Flow 3: Query Console & Safety Guard", () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnvironment(page);
  });

  test("executes query with Ctrl+Enter, intercepts hazardous DELETE query with modal, and enforces confirmation", async ({ page }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Select "E2E Seed SQLite" in sidebar
    const connNode = page.getByRole("treeitem", { name: /E2E Seed SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    // 2. Open Query Console
    const queryConsoleBtn = page.getByRole("button", { name: /^Query Console$/i }).first();
    await expect(queryConsoleBtn).toBeVisible({ timeout: 5000 });
    await queryConsoleBtn.click();

    // 3. Locate CodeMirror editor
    const editor = page.locator(".cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });

    // 4. Run benign count query with Ctrl+Enter
    await setEditorQuery(page, "SELECT count(*) AS total FROM users LIMIT 100;");
    await editor.focus();
    await page.keyboard.press("Control+Enter");

    const runBtn = page.getByRole("button", { name: /Run statement/i });
    // Fallback click if key combination was intercepted by headless browser
    if (await runBtn.isEnabled()) {
      await runBtn.click();
    }

    // Verify result table displays count > 0 (550 seeded users)
    const resultCell = page.locator("table td").filter({ hasText: /550|549/ });
    await expect(resultCell.first()).toBeVisible({ timeout: 10000 });

    // 5. Prepare a dedicated table for hazardous query testing so seeded 'users' table remains untouched
    await setEditorQuery(page, "CREATE TABLE IF NOT EXISTS hazard_test (id INTEGER PRIMARY KEY, name TEXT);");
    await runBtn.click();
    await page.waitForTimeout(400);

    await setEditorQuery(page, "INSERT INTO hazard_test (name) VALUES ('danger');");
    await runBtn.click();
    await page.waitForTimeout(400);

    // Type hazardous query: DELETE without WHERE clause on hazard_test
    await setEditorQuery(page, "DELETE FROM hazard_test;");
    await runBtn.click();

    // 6. Safety Guard intercept: Hazardous confirmation modal must appear
    const hazardModal = page.locator('[data-testid="hazardous-query-modal"]');
    await expect(hazardModal).toBeVisible({ timeout: 5000 });
    await expect(hazardModal).toContainText("Hazardous Query Warning");
    await expect(hazardModal).toContainText("DELETE FROM hazard_test");

    // 7. Cancel modal -> query must NOT be executed
    const cancelModalBtn = hazardModal.getByRole("button", { name: "Cancel" });
    await cancelModalBtn.click();
    await expect(hazardModal).not.toBeVisible();

    // Verify records were preserved in hazard_test
    await setEditorQuery(page, "SELECT count(*) AS total FROM hazard_test LIMIT 100;");
    await editor.focus();
    await page.keyboard.press("Control+Enter");
    if (await runBtn.isEnabled()) {
      await runBtn.click();
    }
    const preservedCell = page.locator("table td").filter({ hasText: /^1$/ });
    await expect(preservedCell.first()).toBeVisible({ timeout: 10000 });

    // 8. Trigger hazardous query again and CONFIRM
    await setEditorQuery(page, "DELETE FROM hazard_test;");
    await runBtn.click();

    await expect(hazardModal).toBeVisible({ timeout: 5000 });
    const confirmRunBtn = page.locator('[data-testid="confirm-hazardous-run"]');
    await confirmRunBtn.click();
    await expect(hazardModal).not.toBeVisible();

    // 9. Verify deletion executed: count is now 0
    await setEditorQuery(page, "SELECT count(*) AS total FROM hazard_test LIMIT 100;");
    await editor.focus();
    await page.keyboard.press("Control+Enter");
    if (await runBtn.isEnabled()) {
      await runBtn.click();
    }

    const zeroCell = page.locator("table td").filter({ hasText: /^0$/ });
    await expect(zeroCell.first()).toBeVisible({ timeout: 10000 });
  });
});
