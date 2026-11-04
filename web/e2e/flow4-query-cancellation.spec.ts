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

test.describe("Flow 4: Heavy Query Cancellation", () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnvironment(page);
  });

  test("runs heavy query, activates cancel button with spinner, and cancels execution immediately", async ({ page }) => {
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

    // 4. Input heavy recursive query in SQLite that takes several seconds
    await setEditorQuery(
      page,
      "WITH RECURSIVE r(i) AS (VALUES(0) UNION ALL SELECT i+1 FROM r WHERE i<30000000) SELECT count(*) FROM r LIMIT 1;",
    );

    // 5. Trigger execution
    const runBtn = page.getByRole("button", { name: /Run statement/i });
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // 6. Verify active running state with spinner and Cancel button
    const cancelBtn = page.getByRole("button", { name: /Cancel|Hủy/i });
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await expect(cancelBtn).toBeEnabled();

    // 7. Click Cancel within 1 second
    await cancelBtn.click();

    // 8. Verify execution terminates immediately and returns to idle state
    await expect(cancelBtn).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /Run statement/i })).toBeEnabled();
  });
});
