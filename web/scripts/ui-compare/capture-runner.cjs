#!/usr/bin/env node
/**
 * Unified UI State Capture Runner
 * Captures computed DOM styles and screenshots across dual themes
 * based on a modular State Registry.
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// Parse CLI arguments
const args = process.argv.slice(2);
let serverUrl = "http://localhost:18080";
let outDir = "/tmp/ui_compare_capture";
let statesFilter = "all";
let themesFilter = "light,dark";
let dbPath = path.resolve(__dirname, "../../testdata/e2e_seed.db");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) serverUrl = args[++i];
  else if (args[i] === "--out" && args[i + 1]) outDir = args[++i];
  else if (args[i] === "--states" && args[i + 1]) statesFilter = args[++i];
  else if (args[i] === "--themes" && args[i + 1]) themesFilter = args[++i];
  else if (args[i] === "--db" && args[i + 1]) dbPath = path.resolve(args[++i]);
}

const activeThemes = themesFilter.split(",").map((t) => t.trim().toLowerCase());
fs.mkdirSync(outDir, { recursive: true });

async function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  const healthUrl = url.replace(/\/+$/, "") + "/health";
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${healthUrl} did not respond within ${timeout}ms`);
}

async function dumpDomStyles(page) {
  return await page.evaluate(() => {
    function getStablePath(el) {
      if (!(el instanceof Element)) return "";
      const pathArr = [];
      let curr = el;
      while (
        curr &&
        curr.nodeType === Node.ELEMENT_NODE &&
        curr !== document.body &&
        curr !== document.documentElement
      ) {
        let piece = curr.tagName.toLowerCase();
        const dataSlot = curr.getAttribute("data-slot");
        const role = curr.getAttribute("role");

        if (dataSlot) {
          piece += `[data-slot="${dataSlot}"]`;
        } else if (role) {
          piece += `[role="${role}"]`;
        }

        let nth = 1;
        let sib = curr;
        while ((sib = sib.previousElementSibling)) {
          if (sib.tagName === curr.tagName) nth++;
        }
        piece += `:nth-of-type(${nth})`;
        pathArr.unshift(piece);
        curr = curr.parentElement;
      }
      return pathArr.join(" > ");
    }

    const elements = document.querySelectorAll("*");
    const result = {};

    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      if (["script", "style", "noscript", "meta", "link"].includes(tag))
        continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const cs = window.getComputedStyle(el);
      const p = getStablePath(el);
      if (!p) continue;

      result[p] = {
        tag,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30),
        dataSlot: el.getAttribute("data-slot") || null,
        role: el.getAttribute("role") || null,
        className: el.className ? String(el.className) : "",
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderTopColor: cs.borderTopColor,
        borderRightColor: cs.borderRightColor,
        borderBottomColor: cs.borderBottomColor,
        borderLeftColor: cs.borderLeftColor,
        outlineColor: cs.outlineColor,
        boxShadow: cs.boxShadow,
        opacity: cs.opacity,
      };
    }
    return result;
  });
}

async function setPageTheme(page, theme) {
  await page.evaluate((th) => {
    localStorage.setItem("pb_theme", th);
    if (th === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, theme);
  await page.waitForTimeout(100);
}

async function captureDualTheme(page, stateName, results) {
  for (const th of activeThemes) {
    await setPageTheme(page, th);
    const key = `${stateName}_${th}`;
    results[key] = await dumpDomStyles(page);
    try {
      await page.screenshot({ path: path.join(outDir, `${key}.png`) });
    } catch {}
  }
}

async function captureHoverDualTheme(page, locator, stateName, results) {
  for (const th of activeThemes) {
    await setPageTheme(page, th);
    const key = `${stateName}_hover_${th}`;
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      await locator.hover({ force: true, timeout: 2500 });
      await page.waitForTimeout(120);
      results[key] = await dumpDomStyles(page);
      await page.screenshot({ path: path.join(outDir, `${key}.png`) });
    } catch {
      // Fallback if hover fails
      results[key] = await dumpDomStyles(page);
    }
  }
}

function shouldRunGroup(groupName) {
  if (statesFilter === "all" || !statesFilter) return true;
  const regex = new RegExp(statesFilter, "i");
  return regex.test(groupName);
}

async function run() {
  await waitForServer(serverUrl);
  console.log(`Server at ${serverUrl} is ready.`);

  // 1. Authenticate with server to acquire JWT token
  let token = null;
  try {
    const loginRes = await fetch(`${serverUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "pebblebase" }),
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      token = data.token;
      console.log("Successfully authenticated as admin via API.");
    } else {
      console.warn(
        "Auto-login via API returned:",
        loginRes.status,
        await loginRes.text(),
      );
    }
  } catch (err) {
    console.warn("Auto-login via API failed:", err.message);
  }

  // Pre-register test connection if not exists
  if (token) {
    try {
      const connRes = await fetch(`${serverUrl}/api/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const conns = connRes.ok ? await connRes.json() : [];
      if (!conns.find((c) => c.name === "E2E Seed SQLite")) {
        const createRes = await fetch(`${serverUrl}/api/connections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: "E2E Seed SQLite",
            type: "sqlite",
            mode: "form",
            filepath: dbPath,
            save_password: false,
          }),
        });
        if (createRes.ok) {
          console.log(
            `Registered connection "E2E Seed SQLite" pointing to ${dbPath}`,
          );
        }
      }
    } catch (err) {
      console.warn("Failed to ensure connection:", err.message);
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = {};

  try {
    // ==========================================
    // GROUP: GENERAL (LOGIN SCREEN)
    // ==========================================
    if (shouldRunGroup("general") || shouldRunGroup("login")) {
      console.log("\n[Group: general] Capturing Login states...");
      const loginCtx = await browser.newContext({
        viewport: { width: 1400, height: 900 },
      });
      const loginPage = await loginCtx.newPage();

      await loginPage.addInitScript(() => {
        const style = document.createElement("style");
        style.textContent =
          "*, *::before, *::after { transition: none !important; animation: none !important; }";
        if (document.head) {
          document.head.appendChild(style);
        } else {
          document.addEventListener("DOMContentLoaded", () =>
            document.head.appendChild(style),
          );
        }
      });

      await loginPage.goto(`${serverUrl}/login`);
      await loginPage.waitForLoadState("networkidle");

      await captureDualTheme(loginPage, "login_screen_default", results);

      const signInBtn = loginPage.getByRole("button", {
        name: /Sign in|Đăng nhập/i,
      });
      if (await signInBtn.isVisible()) {
        await captureHoverDualTheme(
          loginPage,
          signInBtn,
          "login_signin_btn",
          results,
        );
      }

      const usernameInput = loginPage.locator("#login-username");
      const passwordInput = loginPage.locator("#login-password");
      if (
        (await usernameInput.isVisible()) &&
        (await passwordInput.isVisible())
      ) {
        await usernameInput.fill("invalid-user");
        await passwordInput.fill("wrong-pass");
        await signInBtn.click();
        await loginPage.waitForTimeout(600);
        await captureDualTheme(loginPage, "login_screen_invalid", results);

        await loginPage.evaluate(() => {
          const u = document.querySelector("#login-username");
          const p = document.querySelector("#login-password");
          if (u) u.setAttribute("disabled", "true");
          if (p) p.setAttribute("disabled", "true");
        });
        await captureDualTheme(
          loginPage,
          "login_screen_disabled_inputs",
          results,
        );
      }

      await loginCtx.close();
    }

    // Authenticated App Context
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
    });
    const page = await context.newPage();

    await page.addInitScript(
      ({ authToken }) => {
        if (authToken) {
          localStorage.setItem(
            "pebblebase-auth",
            JSON.stringify({
              state: {
                token: authToken,
                user: { id: 1, username: "admin", role: "admin" },
              },
            }),
          );
        }
        if (!navigator.clipboard) {
          navigator.clipboard = {};
        }
        navigator.clipboard.writeText = async () => {};

        const origGet = localStorage.getItem.bind(localStorage);
        localStorage.getItem = (key) => {
          if (key && (key.includes("onboarding") || key.includes("tour")))
            return "true";
          return origGet(key);
        };
        const style = document.createElement("style");
        style.textContent =
          "*, *::before, *::after { transition: none !important; animation: none !important; }";
        if (document.head) {
          document.head.appendChild(style);
        } else {
          document.addEventListener("DOMContentLoaded", () =>
            document.head.appendChild(style),
          );
        }
      },
      { authToken: token },
    );

    await page.goto(`${serverUrl}/`);
    await page.waitForLoadState("networkidle");

    try {
      const exploreBtn = page.getByRole("button", {
        name: /Explore on My Own/i,
      });
      if (await exploreBtn.isVisible({ timeout: 1500 }))
        await exploreBtn.click();
    } catch {}

    // ==========================================
    // GROUP: GENERAL (WORKSPACE & CONNECTION)
    // ==========================================
    if (shouldRunGroup("general")) {
      console.log(
        "\n[Group: general] Capturing Workspace Home & Connection Modal...",
      );
      await captureDualTheme(page, "workspace_home", results);

      const newConnBtn = page
        .getByRole("button", { name: /New connection|Manage Data Sources/i })
        .first();
      if (await newConnBtn.isVisible()) {
        await captureHoverDualTheme(
          page,
          newConnBtn,
          "workspace_newconn_btn",
          results,
        );
        await newConnBtn.click();
        await page.waitForTimeout(500);

        await captureDualTheme(page, "conn_modal_general", results);

        const advTab = page
          .locator('[role="dialog"]')
          .getByRole("tab", { name: /Advanced|Nâng cao/i });
        if (await advTab.isVisible()) {
          await captureHoverDualTheme(page, advTab, "conn_tab_adv", results);
          await advTab.click();
          await page.waitForTimeout(300);
          await captureDualTheme(page, "conn_modal_advanced", results);

          const genTab = page
            .locator('[role="dialog"]')
            .getByRole("tab", { name: /General|Chung/i });
          if (await genTab.isVisible()) await genTab.click();
          await page.waitForTimeout(200);
        }

        const driverTrigger = page
          .locator('[role="dialog"] [data-slot="select-trigger"]')
          .first();
        if (await driverTrigger.isVisible()) {
          await captureHoverDualTheme(
            page,
            driverTrigger,
            "conn_driver_trigger",
            results,
          );
          await driverTrigger.click();
          await page.waitForTimeout(300);
          await captureDualTheme(page, "conn_driver_select_open", results);

          const selectItem = page.locator('[role="option"]').nth(1);
          if (await selectItem.isVisible()) {
            await captureHoverDualTheme(
              page,
              selectItem,
              "conn_driver_item",
              results,
            );
          }
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);
        }

        const checkbox = page
          .locator('[role="dialog"] [role="checkbox"]')
          .first();
        if (await checkbox.isVisible()) {
          await captureDualTheme(page, "conn_checkbox_unchecked", results);
          await checkbox.click();
          await page.waitForTimeout(200);
          await captureDualTheme(page, "conn_checkbox_checked", results);
          await checkbox.click();
          await page.waitForTimeout(200);
        }

        const testBtn = page
          .locator('[role="dialog"]')
          .getByRole("button", { name: /Test Connection|Kiểm tra/i });
        if (await testBtn.isVisible()) {
          await captureHoverDualTheme(page, testBtn, "conn_test_btn", results);
          await testBtn.click();
          await page.waitForTimeout(1000);
          await captureDualTheme(page, "conn_modal_alert", results);
        }

        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }

      // AdminPanel
      console.log("\n[Group: general] Capturing AdminPanel...");
      const settingsHomeBtn = page
        .getByRole("button", { name: /^Settings$/i })
        .first();
      if (await settingsHomeBtn.isVisible()) {
        await settingsHomeBtn.click();
        await page.waitForTimeout(500);

        await captureDualTheme(page, "admin_panel_users", results);

        const pwdTab = page
          .locator('[role="dialog"]')
          .getByRole("tab", { name: /Password/i });
        if (await pwdTab.isVisible()) {
          await captureHoverDualTheme(page, pwdTab, "admin_tab_pwd", results);
          await pwdTab.click();
          await page.waitForTimeout(300);
          await captureDualTheme(page, "admin_panel_password", results);
        }

        const auditTab = page
          .locator('[role="dialog"]')
          .getByRole("tab", { name: /Audit/i });
        if (await auditTab.isVisible()) {
          await captureHoverDualTheme(
            page,
            auditTab,
            "admin_tab_audit",
            results,
          );
          await auditTab.click();
          await page.waitForTimeout(300);
          await captureDualTheme(page, "admin_panel_audit", results);

          const refreshBtn = page
            .locator('[role="dialog"]')
            .getByRole("button", { name: /Refresh|Làm mới/i });
          if (await refreshBtn.isVisible()) {
            await captureHoverDualTheme(
              page,
              refreshBtn,
              "admin_refresh_btn",
              results,
            );
          }
        }

        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }
    }

    // Navigate to Database Explorer -> Table
    const connNode = page.getByRole("treeitem", { name: /E2E Seed SQLite/i });
    await connNode.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (await connNode.isVisible()) {
      await connNode.click();
      await page.waitForTimeout(400);

      const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
      await tablesFolder
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});
      if (await tablesFolder.isVisible()) {
        await tablesFolder.click();
        await page.waitForTimeout(400);
      }

      const usersNode = page.getByRole("treeitem", { name: /users/i });
      await usersNode
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});
      if (await usersNode.isVisible()) {
        await usersNode.click();
        await page.waitForTimeout(1200);
      }
    }

    // ==========================================
    // GROUP: GENERAL (DATAGRID & VIEWS)
    // ==========================================
    if (shouldRunGroup("general")) {
      console.log(
        "\n[Group: general] Capturing DataGrid, Toolbar, FilterBar...",
      );
      await captureDualTheme(page, "datagrid_view", results);

      const filterBarTrigger1 = page
        .locator(
          '[data-tour="datagrid-view"] form [data-slot="select-trigger"]',
        )
        .first();
      if (await filterBarTrigger1.isVisible()) {
        await captureHoverDualTheme(
          page,
          filterBarTrigger1,
          "filterbar_trigger_id",
          results,
        );
      }

      const filterInput = page
        .locator('[data-tour="datagrid-view"] form input[data-slot="input"]')
        .first();
      if (await filterInput.isVisible()) {
        await filterInput.fill("admin");
        await page.waitForTimeout(200);
        await captureDualTheme(page, "filterbar_with_text", results);
      }

      const headerCell = page
        .locator('[data-tour="datagrid-view"] [role="columnheader"]')
        .nth(1);
      if (await headerCell.isVisible()) {
        await captureHoverDualTheme(
          page,
          headerCell,
          "datagrid_header",
          results,
        );
      }

      const colMenuBtn = page
        .locator('[data-tour="datagrid-view"] [role="columnheader"]')
        .first()
        .locator("button")
        .first();
      if (await colMenuBtn.isVisible()) {
        await colMenuBtn.click();
        await page.waitForTimeout(300);
        await captureDualTheme(page, "datagrid_colmenu_open", results);

        const menuItem = page.locator('[role="menuitem"]').first();
        if (await menuItem.isVisible()) {
          await captureHoverDualTheme(
            page,
            menuItem,
            "datagrid_menuitem",
            results,
          );
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }

      const rowCheckbox = page
        .locator('[data-tour="datagrid-view"] [role="row"] [role="checkbox"]')
        .nth(1);
      if (await rowCheckbox.isVisible()) {
        await rowCheckbox.click();
        await page.waitForTimeout(200);
        await captureDualTheme(page, "datagrid_row_selected", results);
      }

      // Import / Export Quick Modals
      const importBtn = page.getByRole("button", { name: /Import/i }).first();
      if (await importBtn.isVisible()) {
        await importBtn.click();
        await page.waitForTimeout(500);
        await captureDualTheme(page, "import_modal", results);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }

      const exportBtn = page.getByRole("button", { name: /Export/i }).first();
      if (await exportBtn.isVisible()) {
        await exportBtn.click();
        await page.waitForTimeout(500);
        await captureDualTheme(page, "export_modal", results);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }

      // Schema Inspector
      const schemaTab = page.getByRole("tab", { name: /Schema|Lược đồ/i });
      if (await schemaTab.isVisible()) {
        await captureHoverDualTheme(page, schemaTab, "schema_tab", results);
        await schemaTab.click();
        await page.waitForTimeout(500);
        await captureDualTheme(page, "schema_inspector", results);

        const dataTab = page.getByRole("tab", { name: /Data|Dữ liệu/i });
        if (await dataTab.isVisible()) await dataTab.click();
        await page.waitForTimeout(400);
      }

      // Basic RowModal
      const addRowBtn = page
        .getByRole("button", { name: /Add row|Thêm hàng|Insert/i })
        .first();
      if (await addRowBtn.isVisible()) {
        await addRowBtn.click();
        await page.waitForTimeout(500);
        await captureDualTheme(page, "row_modal", results);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }

      // DeleteRowDialog (AlertDialog)
      const firstRow = page
        .locator('[data-tour="datagrid-view"] [role="row"]')
        .nth(1);
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForTimeout(200);
        const deleteRowBtn = page.getByRole("button", {
          name: /Delete row|Xóa hàng/i,
        });
        if (await deleteRowBtn.isVisible()) {
          await deleteRowBtn.click();
          await page.waitForTimeout(500);
          await captureDualTheme(page, "alert_dialog", results);

          const cancelBtn = page.getByRole("button", { name: /Cancel|Hủy/i });
          if (await cancelBtn.isVisible()) {
            await captureHoverDualTheme(
              page,
              cancelBtn,
              "alert_cancel_btn",
              results,
            );
          }
          await page.keyboard.press("Escape");
          await page.waitForTimeout(400);
        }
      }

      // Query Console & ERD
      const queryConsoleBtn = page
        .getByRole("button", { name: /New Query Console|Query/i })
        .first();
      if (await queryConsoleBtn.isVisible()) {
        await queryConsoleBtn.click();
        await page.waitForTimeout(800);
        await captureDualTheme(page, "query_console", results);

        const runBtn = page.getByRole("button", { name: /Run|Chạy/i }).first();
        if (await runBtn.isVisible()) {
          await captureHoverDualTheme(page, runBtn, "query_run_btn", results);
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }

      const erdBtn = page
        .getByRole("button", { name: /ER Diagram|ERD/i })
        .first();
      if (await erdBtn.isVisible()) {
        await erdBtn.click({ force: true });
        await page.waitForTimeout(800);
        await captureDualTheme(page, "erd_view", results);

        // Switch back to users table tab
        const usersTab = page.getByRole("tab", { name: /users/i }).first();
        if (await usersTab.isVisible()) {
          await usersTab.click();
          await page.waitForTimeout(400);
        }
      }
    }

    // ==========================================
    // GROUP: IMPORT-EXPORT MODAL STATES (36)
    // ==========================================
    if (shouldRunGroup("import") || shouldRunGroup("export")) {
      console.log(
        "\n[Group: import-export] Capturing all Import & Export Modal states...",
      );
      const usersTab = page.getByRole("tab", { name: /users/i }).first();
      if (await usersTab.isVisible()) {
        await usersTab.click();
        await page.waitForTimeout(400);
      } else {
        const usersNode = page.getByRole("treeitem", { name: /users/i });
        if (await usersNode.isVisible()) {
          await usersNode.click();
          await page.waitForTimeout(800);
        }
      }

      const importBtn = page.getByRole("button", { name: /Import/i }).first();
      if (await importBtn.isVisible()) {
        await importBtn.click();
        await page
          .locator('[role="dialog"]')
          .waitFor({ state: "visible", timeout: 5000 });
        await page.waitForTimeout(400);
      }

      // State 1: Import Modal Empty
      await captureDualTheme(page, "import_modal_empty", results);

      const headerExportBtn = page
        .locator('[role="dialog"]')
        .getByRole("button", { name: /^Export Data$|^Export$/i });
      const headerImportBtn = page
        .locator('[role="dialog"]')
        .getByRole("button", { name: /^Import CSV$|^Import$/i });
      if (await headerExportBtn.isVisible()) {
        await captureHoverDualTheme(
          page,
          headerExportBtn,
          "import_tab_export",
          results,
        );
      }
      if (await headerImportBtn.isVisible()) {
        await captureHoverDualTheme(
          page,
          headerImportBtn,
          "import_tab_import",
          results,
        );
      }

      const closeXBtn = page
        .locator(
          '[role="dialog"] button:has(svg.lucide-x), [role="dialog"] [aria-label="Close"]',
        )
        .first();
      if (await closeXBtn.isVisible()) {
        await captureHoverDualTheme(
          page,
          closeXBtn,
          "import_modal_x_btn",
          results,
        );
      }

      // Drag-over
      const dropZone = page
        .locator('[role="dialog"] [data-slot="dialog-content"]')
        .locator("div.border-dashed")
        .first();
      if (await dropZone.isVisible()) {
        await dropZone.dispatchEvent("dragover");
        await page.waitForTimeout(200);
        await captureDualTheme(page, "import_modal_dragover", results);
        await dropZone.dispatchEvent("dragleave");
        await page.waitForTimeout(100);
      }

      // Upload CSV
      const testCsvContent =
        "id,name,email,role,status\n1001,John Doe,john@example.com,developer,active\n1002,Jane Smith,jane@example.com,designer,active";
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput
        .waitFor({ state: "attached", timeout: 5000 })
        .catch(() => {});
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles({
          name: "test_users.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(testCsvContent),
        });
      }
      await page.waitForTimeout(600);

      await captureDualTheme(page, "import_modal_file_selected", results);

      // Mapping Select
      const mappingTrigger = page
        .locator('[role="dialog"] [data-slot="select-trigger"]')
        .first();
      if (await mappingTrigger.isVisible()) {
        await mappingTrigger.click();
        await page.waitForTimeout(300);
        await captureDualTheme(
          page,
          "import_modal_mapping_select_open",
          results,
        );

        const mapItem = page.locator('[data-slot="select-item"]').nth(1);
        if (await mapItem.isVisible()) {
          await captureHoverDualTheme(
            page,
            mapItem,
            "import_mapping_item",
            results,
          );
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }

      // Validation Warning (duplicate mapping)
      const secondMappingTrigger = page
        .locator('[role="dialog"] [data-slot="select-trigger"]')
        .nth(1);
      if (await secondMappingTrigger.isVisible()) {
        await secondMappingTrigger.click();
        await page.waitForTimeout(200);
        const idOption = page
          .locator('[data-slot="select-item"]')
          .filter({ hasText: /^id$/i })
          .first();
        if (await idOption.isVisible()) {
          await idOption.click();
          await page.waitForTimeout(300);
          await captureDualTheme(page, "import_modal_validation_warn", results);
        }
      }

      // Import Error Alert
      const importSubmitBtn = page
        .locator('[role="dialog"]')
        .getByRole("button", { name: /Import Records|Import/i })
        .first();
      await page.route(
        "**/api/connections/*/tables/*/import",
        async (route) => {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error:
                "Failed to insert record: duplicate email constraint violated",
            }),
          });
        },
      );

      if (
        (await importSubmitBtn.isVisible()) &&
        !(await importSubmitBtn.isDisabled())
      ) {
        await importSubmitBtn.click();
        await page.waitForTimeout(600);
        await captureDualTheme(page, "import_modal_error_alert", results);
      }
      await page.unroute("**/api/connections/*/tables/*/import");

      // Import Success Screen
      await page.route(
        "**/api/connections/*/tables/*/import",
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              inserted_count: 2,
              duration_ms: 38,
            }),
          });
        },
      );

      if (
        (await importSubmitBtn.isVisible()) &&
        !(await importSubmitBtn.isDisabled())
      ) {
        await importSubmitBtn.click();
        await page.waitForTimeout(500);
        await captureDualTheme(page, "import_modal_success_screen", results);
      }
      await page.unroute("**/api/connections/*/tables/*/import");

      // Export Modal States
      if (await headerExportBtn.isVisible()) {
        await headerExportBtn.click();
        await page.waitForTimeout(400);
      }

      const exportActionBtn = page
        .locator('[role="dialog"]')
        .getByRole("button", { name: /Download Export|Copy Export/i })
        .first();
      if (await exportActionBtn.isVisible()) {
        await captureHoverDualTheme(
          page,
          exportActionBtn,
          "export_btn",
          results,
        );
      }

      const formatTrigger = page
        .locator('[role="dialog"] [data-slot="select-trigger"]')
        .first();
      for (const fmt of ["csv", "json", "sql", "excel"]) {
        if (await formatTrigger.isVisible()) {
          await formatTrigger.click();
          await page.waitForTimeout(200);
          const opt = page
            .locator('[data-slot="select-item"]')
            .filter({ hasText: new RegExp(fmt, "i") })
            .first();
          if (await opt.isVisible()) {
            if (fmt === "csv") {
              await captureHoverDualTheme(
                page,
                opt,
                "export_format_item",
                results,
              );
            }
            await opt.click();
            await page.waitForTimeout(200);
          }
          await captureDualTheme(page, `export_modal_format_${fmt}`, results);
        }
      }

      // Reset to CSV
      if (await formatTrigger.isVisible()) {
        await formatTrigger.click();
        await page.waitForTimeout(200);
        const csvOpt = page
          .locator('[data-slot="select-item"]')
          .filter({ hasText: /^CSV/i })
          .first();
        if (await csvOpt.isVisible()) {
          await csvOpt.click();
          await page.waitForTimeout(200);
        }
      }

      // Scope & Destination toggles
      const allFilteredBtn = page
        .locator('[role="dialog"]')
        .getByRole("button", { name: /^All filtered$/i });
      if (await allFilteredBtn.isVisible()) {
        await allFilteredBtn.click();
        await page.waitForTimeout(200);
        await captureDualTheme(page, "export_modal_scope_filtered", results);
        const pageScopeBtn = page
          .locator('[role="dialog"]')
          .getByRole("button", { name: /^Current page$/i });
        if (await pageScopeBtn.isVisible()) await pageScopeBtn.click();
        await page.waitForTimeout(200);
      }

      const copyDestBtn = page
        .locator('[role="dialog"]')
        .getByRole("button", { name: /^Copy$/i });
      if (await copyDestBtn.isVisible()) {
        await copyDestBtn.click();
        await page.waitForTimeout(200);
        await captureDualTheme(page, "export_modal_dest_copy", results);

        const copyBtn = page
          .locator('[role="dialog"]')
          .getByRole("button", { name: /Copy Export/i });
        if (await copyBtn.isVisible()) {
          await copyBtn.click();
          await page.waitForTimeout(500);
          await captureDualTheme(page, "export_modal_success_alert", results);
        }
      }

      // Export error alert
      await page.route(
        "**/api/connections/*/tables/*/export*",
        async (route) => {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Failed to generate export file" }),
          });
        },
      );
      const fileDestBtn = page
        .locator('[role="dialog"]')
        .getByRole("button", { name: /^File$/i });
      if (await fileDestBtn.isVisible()) {
        await fileDestBtn.click();
        await page.waitForTimeout(200);
        const downloadBtn = page
          .locator('[role="dialog"]')
          .getByRole("button", { name: /Download Export/i });
        if (await downloadBtn.isVisible()) {
          await downloadBtn.click();
          await page.waitForTimeout(600);
          await captureDualTheme(page, "export_modal_error_alert", results);
        }
      }
      await page.unroute("**/api/connections/*/tables/*/export*");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);

      // Read-Only mode
      console.log("  - Read-Only Import Mode...");
      await page.route("**/api/connections", async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        const updated = json.map((c) => ({ ...c, is_readonly: true }));
        await route.fulfill({ response, json: updated });
      });

      await page.reload();
      await page.waitForLoadState("networkidle");

      const roConnNode = page.getByRole("treeitem", {
        name: /E2E Seed SQLite/i,
      });
      if (await roConnNode.isVisible()) {
        const usersTable = page.getByRole("treeitem", { name: /users/i });
        if (!(await usersTable.isVisible())) {
          await roConnNode.click();
          await page.waitForTimeout(400);
        }
        if (await usersTable.isVisible()) {
          await usersTable.click();
          await page.waitForTimeout(1000);
        }
      }

      const roExportBtn = page
        .getByRole("button", { name: /^Export$/i })
        .first();
      if (await roExportBtn.isVisible()) {
        await roExportBtn.click();
        await page.waitForTimeout(500);
        await captureDualTheme(page, "import_modal_readonly", results);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }
      await page.unroute("**/api/connections");

      // Reload to restore normal mode
      await page.reload();
      await page.waitForLoadState("networkidle");
      const normalConn = page.getByRole("treeitem", {
        name: /E2E Seed SQLite/i,
      });
      if (await normalConn.isVisible()) {
        const uNode = page.getByRole("treeitem", { name: /users/i });
        if (!(await uNode.isVisible())) {
          await normalConn.click();
          await page.waitForTimeout(400);
        }
        if (await uNode.isVisible()) {
          await uNode.click();
          await page.waitForTimeout(1000);
        }
      }
    }

    // ==========================================
    // GROUP: ROW-MODAL STATES (Requirement 3)
    // ==========================================
    if (shouldRunGroup("row-modal") || shouldRunGroup("row_modal")) {
      console.log(
        "\n[Group: row-modal] Capturing RowModal target states (insert, edit, all types, validation, hovers)...",
      );

      // Ensure tree is expanded to sample_records table
      const connNode = page.getByRole("treeitem", { name: /E2E Seed SQLite/i });
      if (await connNode.isVisible()) {
        const tablesFolder = page.getByRole("treeitem", { name: /Tables/i });
        if (!(await tablesFolder.isVisible())) {
          await connNode.click();
          await page.waitForTimeout(300);
        }
        if (await tablesFolder.isVisible()) {
          const sampleNode = page.getByRole("treeitem", {
            name: /sample_records/i,
          });
          if (!(await sampleNode.isVisible())) {
            await tablesFolder.click();
            await page.waitForTimeout(300);
          }
        }
      }

      // Check if sample_records table is present in the tree
      const sampleRecordsNode = page.getByRole("treeitem", {
        name: /sample_records/i,
      });
      await sampleRecordsNode
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});
      if (await sampleRecordsNode.isVisible()) {
        await sampleRecordsNode.click();
        await page.waitForTimeout(1000);
      }

      // 1. RowModal in Insert Mode (all input types empty/default: text, number, bool, json, date, textarea)
      console.log("  - RowModal Insert Mode...");
      const addRowBtn = page
        .getByRole("button", { name: /Add row|Thêm hàng|Insert/i })
        .first();
      await addRowBtn
        .waitFor({ state: "visible", timeout: 8000 })
        .catch(() => {});
      if (await addRowBtn.isVisible()) {
        await addRowBtn.click();
        await page
          .locator('[role="dialog"]')
          .waitFor({ state: "visible", timeout: 5000 })
          .catch(() => {});
        await page.waitForTimeout(500);

        await captureDualTheme(page, "row_modal_insert", results);

        // Boolean Select Trigger & Open state
        const boolSelectTrigger = page
          .locator('[role="dialog"] [data-slot="select-trigger"]')
          .first();
        if (await boolSelectTrigger.isVisible()) {
          await boolSelectTrigger.click();
          await page.waitForTimeout(300);
          await captureDualTheme(page, "row_modal_select_open", results);

          const selectOption = page.locator('[data-slot="select-item"]').nth(1);
          if (await selectOption.isVisible()) {
            await captureHoverDualTheme(
              page,
              selectOption,
              "row_modal_select_item",
              results,
            );
          }
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);
        }

        // Validation Error: Fill id=1, invalid json, hook dispatchEvent to reject draft, and click save
        const idInput = page
          .locator('[role="dialog"] input[type="number"]')
          .first();
        if (await idInput.isVisible()) {
          await idInput.fill("1");
        }
        const jsonTextarea = page.locator('[role="dialog"] textarea').first();
        if (await jsonTextarea.isVisible()) {
          await jsonTextarea.fill('{"invalid_json": unquoted_value');
          await page.waitForTimeout(200);
        }

        const saveBtn = page
          .locator('[role="dialog"]')
          .getByRole("button", { name: /Save|Lưu|Create|Insert/i })
          .first();
        if (await saveBtn.isVisible()) {
          await captureHoverDualTheme(
            page,
            saveBtn,
            "row_modal_save_btn",
            results,
          );

          await page.evaluate(() => {
            window.__origDispatch = window.dispatchEvent.bind(window);
            window.dispatchEvent = function (event) {
              if (event.type === "pb:stage-row-draft") {
                throw new Error(
                  'Validation Error: Column "title" cannot be empty and "id" must be unique.',
                );
              }
              return window.__origDispatch(event);
            };
          });

          await saveBtn.click();
          await page.waitForTimeout(500);

          // Validation alert shown inside open dialog
          await captureDualTheme(page, "row_modal_validation_error", results);

          await page.evaluate(() => {
            if (window.__origDispatch) {
              window.dispatchEvent = window.__origDispatch;
            }
          });
        }

        const cancelBtn = page
          .locator('[role="dialog"]')
          .getByRole("button", { name: /Cancel|Hủy/i })
          .first();
        if (await cancelBtn.isVisible()) {
          await captureHoverDualTheme(
            page,
            cancelBtn,
            "row_modal_cancel_btn",
            results,
          );
        }

        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }

      // 2. RowModal in Edit Mode (fields populated, read-only/disabled PK, delete button)
      console.log("  - RowModal Edit Mode...");
      const editOpened = await page.evaluate(() => {
        const el = document.querySelector("[data-table-workspace]");
        if (!el) return false;
        const key = Object.keys(el).find(
          (k) =>
            k.startsWith("__reactFiber$") ||
            k.startsWith("__reactInternalInstance$"),
        );
        if (!key) return false;
        let fiber = el[key];
        while (fiber) {
          if (
            fiber.memoizedProps &&
            typeof fiber.memoizedProps.onEditRow === "function"
          ) {
            const rows = fiber.memoizedProps.rows || [];
            const row = rows[0] || {
              id: 1,
              title: "Sample Title",
              age: 25,
              rating: 4.5,
              is_active: 1,
              metadata: '{"status": "ok", "tags": ["test"]}',
              created_at: "2026-01-01 12:00:00",
            };
            fiber.memoizedProps.onEditRow(row);
            return true;
          }
          fiber = fiber.return;
        }
        return false;
      });

      if (editOpened) {
        await page
          .locator('[role="dialog"]')
          .waitFor({ state: "visible", timeout: 5000 })
          .catch(() => {});
        await page.waitForTimeout(500);

        await captureDualTheme(page, "row_modal_edit", results);

        const deleteBtn = page
          .locator('[role="dialog"]')
          .getByRole("button", { name: /Delete|Xóa/i })
          .first();
        if (await deleteBtn.isVisible()) {
          await captureHoverDualTheme(
            page,
            deleteBtn,
            "row_modal_delete_btn",
            results,
          );
        }

        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }
    }

    fs.writeFileSync(
      path.join(outDir, "computed_styles.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(
      `\nSUCCESS: Capture finished! Saved ${Object.keys(results).length} states into ${outDir}`,
    );

    await browser.close();
  } catch (err) {
    console.error("Error during capture runner:", err);
    await browser.close();
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
