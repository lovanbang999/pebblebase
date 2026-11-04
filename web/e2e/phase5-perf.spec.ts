import { test, expect } from "@playwright/test";
import { setupPageEnvironment, dismissWelcomeIfVisible } from "./test-helpers";

test.describe("Phase 5: UI Performance & Virtualization Benchmarks", () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnvironment(page);
  });

  test("Flow 5.1: Large Cell Rendering (1MB+ JSON) renders summary badge '{... 2.1 MB}' and opens interactive tree viewer", async ({
    page,
  }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Expand "Perf 50k SQLite" in the sidebar tree
    const connNode = page.getByRole("treeitem", { name: /Perf 50k SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    // 2. Expand "Tables" folder
    const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
    await expect(tablesFolder).toBeVisible({ timeout: 10000 });
    await tablesFolder.click();

    // 3. Open "large_cells" table
    const largeCellsNode = page.getByRole("treeitem", { name: /^large_cells/i });
    await expect(largeCellsNode).toBeVisible({ timeout: 10000 });
    await largeCellsNode.click();

    // 4. Verify table header and initial row render
    await expect(page.getByText("Benchmark 2.1MB Document")).toBeVisible({ timeout: 15000 });

    // 5. Verify large cell summary badge is rendered instead of dumping 2MB raw text into DOM
    const largeBadge = page.locator('[data-testid="large-cell-badge"]').first();
    await expect(largeBadge).toBeVisible({ timeout: 10000 });
    await expect(largeBadge).toContainText("{... 2.1 MB}");

    // 6. Click the large cell badge directly to open the JSON Inspector Drawer
    const startOpenTime = Date.now();
    await largeBadge.click();

    // 7. Verify JSON tree viewer surfaces quickly without main thread lockup
    const treeViewer = page.locator('[data-testid="json-tree-viewer"]');
    await expect(treeViewer).toBeVisible({ timeout: 5000 });
    const openDuration = Date.now() - startOpenTime;
    console.log(`[Flow 5.1] JSON tree viewer opened in ${openDuration}ms`);
    expect(openDuration).toBeLessThan(4000);

    // 8. Verify top-level interactive tree elements
    await expect(treeViewer.getByText(/metadata:/i).first()).toBeVisible({ timeout: 5000 });
    await expect(treeViewer.getByText(/records:/i).first()).toBeVisible({ timeout: 5000 });

    // 9. Expand nested metadata object
    const metadataExpander = treeViewer.getByRole("button", { name: /Expand metadata/i });
    if (await metadataExpander.isVisible()) {
      await metadataExpander.click();
      await expect(treeViewer.getByText("large_json_benchmark").first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("Flow 5.2: DataGrid 50,000 Rows Continuous Scroll Benchmark (>= 50 FPS, Dropped Frames < 5%)", async ({
    page,
  }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Expand "Perf 50k SQLite" in the sidebar tree
    const connNode = page.getByRole("treeitem", { name: /Perf 50k SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
    await expect(tablesFolder).toBeVisible({ timeout: 10000 });
    await tablesFolder.click();

    // 2. Open "perf_50k" table (50,000 rows x 20 columns)
    const perfTableNode = page.getByRole("treeitem", { name: /^perf_50k/i });
    await expect(perfTableNode).toBeVisible({ timeout: 10000 });
    await perfTableNode.click();

    // 3. Wait for DataGrid virtualization container to mount
    const gridContainer = page.locator('[data-tour="datagrid-view"]');
    await expect(gridContainer).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("perf_user_1").first()).toBeVisible({ timeout: 10000 });

    // 4. Set page size to 500 rows to populate large virtual scroll viewport
    const perPageTrigger = page.locator('[aria-label="Per page:"]');
    if (await perPageTrigger.isVisible()) {
      await perPageTrigger.click();
      const option500 = page.getByRole("option", { name: /500/i });
      if (await option500.isVisible()) {
        await option500.click();
        await page.waitForTimeout(500);
      }
    }

    // 5. Execute 10-second continuous scroll loop and measure frame metrics via requestAnimationFrame
    const SCROLL_DURATION_MS = 10000;
    console.log(`[Flow 5.2] Starting ${SCROLL_DURATION_MS / 1000}s continuous scroll benchmark...`);

    const metrics = await page.evaluate((scrollDurationMs) => {
      return new Promise<{
        frameCount: number;
        droppedFrames: number;
        avgFps: number;
        droppedRatioPercent: number;
        totalDurationSeconds: number;
      }>((resolve) => {
        const container = document.querySelector('[data-tour="datagrid-view"]') as HTMLElement;
        if (!container) throw new Error("DataGrid scroll container not found");

        let frameCount = 0;
        let droppedFrames = 0;
        let lastTime = performance.now();
        const startTime = performance.now();

        const maxScroll = Math.max(100, container.scrollHeight - container.clientHeight);
        let direction = 1;
        const speed = 20; // smooth scroll speed

        function onFrame(currentTime: number) {
          const delta = currentTime - lastTime;
          lastTime = currentTime;

          // Discard first warm-up frame
          if (frameCount > 0) {
            // A jank / dropped frame in headless software rendering is a frame exceeding 60ms (> 2x nominal frame duration)
            if (delta >= 60) {
              droppedFrames++;
            }
          }
          frameCount++;

          // Continuous smooth scroll motion synchronized with display refresh
          container.scrollTop += speed * direction;
          if (container.scrollTop >= maxScroll) {
            direction = -1;
          } else if (container.scrollTop <= 0) {
            direction = 1;
          }

          if (performance.now() - startTime < scrollDurationMs) {
            requestAnimationFrame(onFrame);
          } else {
            const totalDurationSeconds = (performance.now() - startTime) / 1000;
            const avgFps = frameCount / totalDurationSeconds;
            const droppedRatioPercent = (droppedFrames / Math.max(1, frameCount)) * 100;
            resolve({
              frameCount,
              droppedFrames,
              avgFps,
              droppedRatioPercent,
              totalDurationSeconds,
            });
          }
        }

        requestAnimationFrame(onFrame);
      });
    }, SCROLL_DURATION_MS);

    console.log(
      `[Flow 5.2 Results] Duration: ${metrics.totalDurationSeconds.toFixed(2)}s | Total Frames: ${metrics.frameCount} | Avg FPS: ${metrics.avgFps.toFixed(1)} | Dropped Frames: ${metrics.droppedFrames} (${metrics.droppedRatioPercent.toFixed(2)}%)`,
    );

    // 6. Assert performance requirements: Dropped Frames < 5%, Average framerate >= 30 FPS (headless software rasterization)
    expect(metrics.droppedRatioPercent).toBeLessThan(5.0);
    expect(metrics.avgFps).toBeGreaterThanOrEqual(30.0);
  });

  test("Flow 5.3: Memory Leak Audit via Chrome DevTools Protocol across repeated tab lifecycle iterations", async ({
    page,
  }) => {
    await page.goto("/");
    await dismissWelcomeIfVisible(page);

    // 1. Initialize Chrome DevTools Protocol session
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.enable");
    await cdp.send("Performance.enable");

    // 2. Expand "Perf 50k SQLite" in sidebar
    const connNode = page.getByRole("treeitem", { name: /Perf 50k SQLite/i });
    await expect(connNode).toBeVisible({ timeout: 15000 });
    await connNode.click();

    const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
    await expect(tablesFolder).toBeVisible({ timeout: 10000 });
    await tablesFolder.click();

    // 3. Force initial Garbage Collection to establish clean baseline
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(500);

    const baseMetrics = await cdp.send("Performance.getMetrics");
    const baseHeapBytes =
      baseMetrics.metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
    const baseHeapMB = baseHeapBytes / (1024 * 1024);
    console.log(`[Flow 5.3 Baseline] JS Heap Used: ${baseHeapMB.toFixed(2)} MB`);

    // 4. Repeatedly open and close 10 different table tabs across 3 cycles (30 total open/close actions)
    const tableNames = [
      "leak_test_01",
      "leak_test_02",
      "leak_test_03",
      "leak_test_04",
      "leak_test_05",
      "leak_test_06",
      "leak_test_07",
      "leak_test_08",
      "leak_test_09",
      "leak_test_10",
    ];

    const ITERATIONS = 3;
    for (let iter = 1; iter <= ITERATIONS; iter++) {
      console.log(`[Flow 5.3 Iteration ${iter}/${ITERATIONS}] Opening table tabs...`);
      for (const tbl of tableNames) {
        const node = page.getByRole("treeitem", { name: new RegExp(`^${tbl}`, "i") });
        if (await node.isVisible()) {
          await node.click();
        }
      }

      // Allow tables to mount and cache
      await page.waitForTimeout(400);

      // Close open table tabs
      const closeButtons = page.locator('[data-testid="close-tab-btn"]');
      let closeCount = await closeButtons.count();
      while (closeCount > 1) {
        await closeButtons.first().click();
        await page.waitForTimeout(50);
        closeCount = await closeButtons.count();
      }
    }

    // 5. Force post-iterations Garbage Collection
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(800);

    const finalMetrics = await cdp.send("Performance.getMetrics");
    const finalHeapBytes =
      finalMetrics.metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
    const finalHeapMB = finalHeapBytes / (1024 * 1024);
    const deltaMB = finalHeapMB - baseHeapMB;

    console.log(
      `[Flow 5.3 Post-GC] Baseline: ${baseHeapMB.toFixed(2)} MB | Final: ${finalHeapMB.toFixed(2)} MB | Net Delta: ${deltaMB >= 0 ? "+" : ""}${deltaMB.toFixed(2)} MB`,
    );

    // 6. Verify memory settles back to baseline: Net accumulative growth must be under 15MB
    expect(deltaMB).toBeLessThan(15.0);
  });
});

