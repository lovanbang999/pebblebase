import { test, expect } from "@playwright/test";
import { setupPageEnvironment, dismissWelcomeIfVisible } from "./test-helpers";

test.describe("Phase 4: Resilience, Chaos & Network Recovery", () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnvironment(page);
  });

  test("Flow 4.1: High Latency (1,500ms - 3,000ms) displays skeletons without locking interaction", async ({
    page,
  }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Expand SQLite connection and Tables folder
    const connNode = page.getByRole("treeitem", { name: /E2E Seed SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
    await expect(tablesFolder).toBeVisible({ timeout: 10000 });
    await tablesFolder.click();

    // 2. Intercept rows endpoint with 1,800ms artificial latency
    let delayed = false;
    await page.route("**/api/connections/*/tables/users/rows*", async (route) => {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await route.continue();
    });

    // 3. Open users table
    const usersNode = page.getByRole("treeitem", { name: /^users/i });
    await expect(usersNode).toBeVisible();
    await usersNode.click();

    // 4. Verify skeletons / loading state appear while request is delayed
    const skeletonOrLoading = page.locator(".animate-pulse").first();
    await expect(skeletonOrLoading).toBeVisible({ timeout: 2000 });

    // 5. Verify UI is not locked: user can interact with other elements
    const newConnectionBtn = page.getByRole("button", { name: /New connection/i }).first();
    await expect(newConnectionBtn).toBeEnabled();

    // 6. Verify data arrives and renders after latency resolves
    const firstUser = page.getByText("User 1").first();
    await expect(firstUser).toBeVisible({ timeout: 10000 });
    expect(delayed).toBe(true);
  });

  test("Flow 4.2: TCP Packet Drop (Sudden Disconnection) mid-fetch surfaces graceful error alert without unhandled rejections", async ({
    page,
  }) => {
    // Monitor unhandled rejections
    const unhandledErrors: string[] = [];
    page.on("pageerror", (err) => unhandledErrors.push(err.message));

    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Expand SQLite connection and Tables folder
    const connNode = page.getByRole("treeitem", { name: /E2E Seed SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
    await expect(tablesFolder).toBeVisible({ timeout: 10000 });
    await tablesFolder.click();

    // 2. Intercept and abort mid-fetch (simulate TCP drop / connection reset)
    await page.route("**/api/connections/*/tables/products/rows*", async (route) => {
      await route.abort("connectionreset");
    });

    // 3. Open products table
    const productsNode = page.getByRole("treeitem", { name: /^products/i });
    await expect(productsNode).toBeVisible();
    await productsNode.click();

    // 4. Verify graceful error alert banner is rendered
    const errorBanner = page.locator('[data-testid="table-fetch-error-banner"]');
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
    await expect(errorBanner).toContainText(/Failed to fetch|Network connection|error/i);

    // 5. Verify Retry button is present and usable
    const retryBtn = errorBanner.getByRole("button", { name: /Retry/i });
    await expect(retryBtn).toBeVisible();

    // 6. Restore network and retry
    await page.unroute("**/api/connections/*/tables/products/rows*");
    await retryBtn.click();

    // 7. Verify table recovers and renders rows
    await expect(page.getByText("SKU-0001").first()).toBeVisible({ timeout: 10000 });
    await expect(errorBanner).not.toBeVisible();

    // No unhandled promise rejections crashed the application
    expect(unhandledErrors.filter((e) => !e.includes("connectionreset"))).toHaveLength(0);
  });

  test("Flow 4.3: Laptop Sleep / Wake Simulation with 5 active tabs surfaces Offline Banner and recovers via 1-click Reconnect", async ({
    page,
  }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Expand sidebar tree
    const connNode = page.getByRole("treeitem", { name: /E2E Seed SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
    await expect(tablesFolder).toBeVisible({ timeout: 10000 });
    await tablesFolder.click();

    // 2. Open Tab 1: users table
    const usersNode = page.getByRole("treeitem", { name: /^users/i });
    await usersNode.click();
    await expect(page.getByText("User 1").first()).toBeVisible({ timeout: 10000 });

    // 3. Open Tab 2: products table
    const productsNode = page.getByRole("treeitem", { name: /^products/i });
    await productsNode.click();
    await expect(page.getByText("SKU-0001").first()).toBeVisible({ timeout: 10000 });

    // 4. Open Tab 3: Query Console
    const queryConsoleBtn = page.getByRole("button", { name: /^Query Console$/i }).first();
    await queryConsoleBtn.click();
    await expect(page.locator(".cm-content")).toBeVisible({ timeout: 10000 });

    // 5. Open Tab 4: ERD View
    const erdBtn = page.getByRole("button", { name: /^ERD Diagram$/i }).first();
    if (await erdBtn.isVisible()) {
      await erdBtn.click();
    }

    // 6. Open Tab 5: Second users tab or filter tab
    await usersNode.click();

    // Verify multiple workspace tabs exist
    const tabsList = page.locator('[role="tab"], [data-tab-id]');
    expect(await tabsList.count()).toBeGreaterThanOrEqual(3);

    // 7. Simulate Laptop Sleep / Network Offline
    await page.context().setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new CustomEvent("pb:network-offline"));
    });

    // 8. Verify prominent top Offline Recovery Banner appears
    const offlineBanner = page.locator('[data-testid="offline-recovery-banner"]');
    await expect(offlineBanner).toBeVisible({ timeout: 5000 });
    await expect(offlineBanner).toContainText(/offline|disconnected/i);

    const reconnectBtn = page.locator('[data-testid="reconnect-network-btn"]');
    await expect(reconnectBtn).toBeVisible();
    await expect(reconnectBtn).toBeEnabled();

    // 9. Simulate Laptop Wake & Restore Connection via 1-click Reconnect
    await page.context().setOffline(false);
    await page.waitForTimeout(500);
    await reconnectBtn.click();

    // 10. Verify Offline Banner disappears and active workspace is preserved
    await expect(offlineBanner).not.toBeVisible({ timeout: 8000 });
    expect(await tabsList.count()).toBeGreaterThanOrEqual(3);
  });

  test("Flow 4.4: SSH Bastion Tunnel Drop gracefully closes session and recovers on subsequent request", async ({
    page,
  }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    const connNode = page.getByRole("treeitem", { name: /E2E Seed SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    const queryConsoleBtn = page.getByRole("button", { name: /^Query Console$/i }).first();
    await queryConsoleBtn.click();
    await expect(page.locator(".cm-content")).toBeVisible({ timeout: 10000 });

    // 1. Simulate SSH Bastion tunnel process being killed mid-session (HTTP 503 Bad Gateway / Tunnel Broken)
    let tunnelKilled = true;
    await page.route("**/api/connections/*/query", async (route) => {
      if (tunnelKilled) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "SSH tunnel process terminated: connection reset by peer (bastion drop)",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // 2. Dispatch query while tunnel is down
    await page.evaluate((text) => {
      if ((window as any).__pb_set_query) {
        (window as any).__pb_set_query(text);
      }
    }, "SELECT 1 AS alive LIMIT 1;");

    const runBtn = page.getByRole("button", { name: /Run statement/i });
    await runBtn.click();

    // 3. Verify client catches tunnel error gracefully
    const errorOutput = page.locator("main").getByText(/SSH tunnel process terminated|connection reset/i);
    await expect(errorOutput.first()).toBeVisible({ timeout: 8000 });

    // 4. Re-initiate tunnel upon next user request (tunnel revived)
    tunnelKilled = false;
    await page.unroute("**/api/connections/*/query");

    // Click Run statement again
    await runBtn.click();

    // 5. Verify query succeeds and returns result
    const aliveCell = page.locator("table td").filter({ hasText: /^1$/ });
    await expect(aliveCell.first()).toBeVisible({ timeout: 10000 });
  });
});
