#!/usr/bin/env node
/**
 * Unified UI State Capture Runner
 * Captures computed DOM styles and screenshots across dual themes
 * based on a modular State Registry.
 */

const { chromium } = require("playwright");
const crypto = require("crypto");
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

      const dialogEl = el.closest('[role="dialog"], [role="alertdialog"]');
      const originRect = dialogEl
        ? dialogEl.getBoundingClientRect()
        : { left: 0, top: 0 };
      const round2 = (n) => Math.round(n * 100) / 100;

      const ariaLabelledBy = el.getAttribute("aria-labelledby");
      let labelledByText = "";
      if (ariaLabelledBy) {
        labelledByText = ariaLabelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || "")
          .join(" ")
          .trim()
          .replace(/\s+/g, " ");
      }
      const rawLabel =
        el.getAttribute("aria-label") ||
        labelledByText ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        el.getAttribute("name") ||
        "";
      const label = rawLabel.trim().replace(/\s+/g, " ").slice(0, 60) || null;

      result[p] = {
        tag,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
        label,
        dataSlot: el.getAttribute("data-slot") || null,
        role: el.getAttribute("role") || null,
        className: el.getAttribute("class") || "",
        inDialog: Boolean(dialogEl),
        bbox: {
          x: round2(rect.left - originRect.left),
          y: round2(rect.top - originRect.top),
          width: round2(rect.width),
          height: round2(rect.height),
        },
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderTopColor: cs.borderTopColor,
        borderRightColor: cs.borderRightColor,
        borderBottomColor: cs.borderBottomColor,
        borderLeftColor: cs.borderLeftColor,
        outlineColor: cs.outlineColor,
        boxShadow: cs.boxShadow,
        opacity: cs.opacity,
        width: cs.width,
        height: cs.height,
        marginTop: cs.marginTop,
        marginRight: cs.marginRight,
        marginBottom: cs.marginBottom,
        marginLeft: cs.marginLeft,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        gap: cs.gap,
        rowGap: cs.rowGap,
        columnGap: cs.columnGap,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
      };
    }
    return result;
  });
}

async function setPageTheme(page, theme) {
  await page.evaluate(async (th) => {
    localStorage.setItem("pb_theme", th);
    if (th === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }, theme);
  await page.waitForTimeout(100);
}

function shouldCaptureDialogClip(stateName) {
  return stateName === "row_modal" || stateName.startsWith("row_modal_");
}

async function computeDialogClipBox(page) {
  return await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [data-slot="select-content"]',
      ),
    );
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.left < minX) minX = rect.left;
      if (rect.top < minY) minY = rect.top;
      if (rect.right > maxX) maxX = rect.right;
      if (rect.bottom > maxY) maxY = rect.bottom;
    }
    if (!Number.isFinite(minX)) return null;
    const x = Math.max(0, Math.floor(minX));
    const y = Math.max(0, Math.floor(minY));
    const right = Math.min(window.innerWidth, Math.ceil(maxX));
    const bottom = Math.min(window.innerHeight, Math.ceil(maxY));
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
  });
}

async function maybeCaptureDialogClip(page, stateName, key, dialogClips) {
  if (!dialogClips || !shouldCaptureDialogClip(stateName)) return;
  const clip = await computeDialogClipBox(page);
  if (!clip) {
    console.warn(
      `WARNING: Expected dialog clip for "${key}", but no visible dialog/select-content found.`,
    );
    return;
  }
  const clipDir = path.join(outDir, "dialog_clips");
  fs.mkdirSync(clipDir, { recursive: true });
  const relPath = path.join("dialog_clips", `${key}.png`);
  const absPath = path.join(outDir, relPath);
  const buf = await page.screenshot({
    path: absPath,
    clip,
    animations: "disabled",
    caret: "hide",
  });
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  dialogClips[key] = { file: relPath, clip, sha256 };
}

async function captureDualTheme(page, stateName, results, dialogClips) {
  for (const th of activeThemes) {
    await setPageTheme(page, th);
    const key = `${stateName}_${th}`;
    results[key] = await dumpDomStyles(page);
    try {
      await page.screenshot({
        path: path.join(outDir, `${key}.png`),
        animations: "disabled",
        caret: "hide",
      });
      await maybeCaptureDialogClip(page, stateName, key, dialogClips);
    } catch {}
  }
}

async function captureHoverDualTheme(
  page,
  locator,
  stateName,
  results,
  dialogClips,
) {
  for (const th of activeThemes) {
    await setPageTheme(page, th);
    const key = `${stateName}_hover_${th}`;
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      await locator.hover({ force: true, timeout: 2500 });
      await page.waitForTimeout(120);
      results[key] = await dumpDomStyles(page);
      await page.screenshot({
        path: path.join(outDir, `${key}.png`),
        animations: "disabled",
        caret: "hide",
      });
      await maybeCaptureDialogClip(page, stateName, key, dialogClips);
    } catch {
      // Fallback if hover fails
      results[key] = await dumpDomStyles(page);
      await maybeCaptureDialogClip(page, stateName, key, dialogClips);
    }
  }
  await page.mouse.move(0, 0).catch(() => {});
  await page.waitForTimeout(50);
}

async function waitForAnalyticsSettled(page, timeout = 6000) {
  const drawer = page.locator('[data-testid="column-analytics-drawer"]');
  await drawer.waitFor({ state: "visible", timeout }).catch(() => {});
  await drawer
    .getByText(/Computing metrics for/i)
    .waitFor({ state: "hidden", timeout })
    .catch(() => {});

  const deadline = Date.now() + timeout;
  let lastSnapshot = null;
  let stableCount = 0;

  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => {
      const root = document.querySelector(
        '[data-testid="column-analytics-drawer"]',
      );
      if (!root) return "";
      const svgs = Array.from(root.querySelectorAll("svg.recharts-surface"));
      if (svgs.length === 0) return "no-svgs";
      return svgs
        .map((svg) => {
          const r = svg.getBoundingClientRect();
          const shapes = Array.from(
            svg.querySelectorAll("path, rect, circle"),
          ).map((el) => {
            const b = el.getBoundingClientRect();
            return [
              el.tagName,
              el.getAttribute("d") || "",
              el.getAttribute("x") || "",
              el.getAttribute("y") || "",
              el.getAttribute("width") || "",
              el.getAttribute("height") || "",
              Math.round(b.width * 10),
              Math.round(b.height * 10),
            ].join(":");
          });
          return `${Math.round(r.width)}x${Math.round(r.height)}[${shapes.join("|")}]`;
        })
        .join("||");
    });

    if (snapshot !== "" && snapshot === lastSnapshot) {
      stableCount++;
      if (stableCount >= 3) break;
    } else {
      lastSnapshot = snapshot;
      stableCount = 0;
    }
    await page.waitForTimeout(200);
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
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
    ],
  });

  const results = {};
  const dialogClips = {};

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

    // Stabilize server query execution timing so the status footer does not jitter across runs
    await page.route(
      /\/api\/connections\/[^/]+\/tables\/[^/]+\/rows(\?|$)/,
      async (route) => {
        const response = await route.fetch();
        const contentType = response.headers()["content-type"] || "";
        if (!contentType.includes("application/json")) {
          await route.fulfill({ response });
          return;
        }
        try {
          const json = await response.json();
          if (json && typeof json.query_time_ms === "number") {
            json.query_time_ms = 1.0;
          }
          if (json && typeof json.execution_time_ms === "number") {
            json.execution_time_ms = 1.0;
          }
          await route.fulfill({ response, json });
        } catch {
          await route.fulfill({ response });
        }
      },
    );

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
        await captureDualTheme(page, "row_modal", results, dialogClips);
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

        await captureDualTheme(page, "row_modal_insert", results, dialogClips);

        // Boolean Select Trigger & Open state
        const boolSelectTrigger = page
          .locator('[role="dialog"] [data-slot="select-trigger"]')
          .first();
        if (await boolSelectTrigger.isVisible()) {
          await boolSelectTrigger.click();
          await page.waitForTimeout(300);
          await captureDualTheme(
            page,
            "row_modal_select_open",
            results,
            dialogClips,
          );

          const selectOption = page.locator('[data-slot="select-item"]').nth(1);
          if (await selectOption.isVisible()) {
            await captureHoverDualTheme(
              page,
              selectOption,
              "row_modal_select_item",
              results,
              dialogClips,
            );
          }
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);
        }

        // Dynamic Fields (open inline creator, add field, hover remove button)
        console.log("  - RowModal Dynamic Fields...");
        const addDynFieldBtn = page
          .locator('[role="dialog"]')
          .getByRole("button", { name: /Add dynamic field/i })
          .first();
        if (await addDynFieldBtn.isVisible()) {
          await addDynFieldBtn.click();
          await page.waitForTimeout(200);
          await captureDualTheme(
            page,
            "row_modal_dynamic_add_open",
            results,
            dialogClips,
          );

          const dynNameInput = page
            .locator('[role="dialog"] input[placeholder*="Field name"]')
            .first();
          const dynValueInput = page
            .locator('[role="dialog"] input[placeholder*="Value"]')
            .first();
          if (
            (await dynNameInput.isVisible()) &&
            (await dynValueInput.isVisible())
          ) {
            await dynNameInput.fill("custom_note");
            await dynValueInput.fill("hello world");
            await page.waitForTimeout(100);

            const addConfirmBtn = page
              .locator('[role="dialog"]')
              .getByRole("button", { name: /^Add$/i })
              .first();
            if (await addConfirmBtn.isVisible()) {
              await addConfirmBtn.click();
              await page.waitForTimeout(250);
              await captureDualTheme(
                page,
                "row_modal_dynamic_field_added",
                results,
                dialogClips,
              );

              const removeDynBtn = page
                .locator(
                  '[role="dialog"] button[title="Remove field"], [role="dialog"] button[title*="Remove"]',
                )
                .first();
              if (await removeDynBtn.isVisible()) {
                await captureHoverDualTheme(
                  page,
                  removeDynBtn,
                  "row_modal_dynamic_remove_btn",
                  results,
                  dialogClips,
                );
                await removeDynBtn.click();
                await page.waitForTimeout(200);
              }
            }
          }
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
            dialogClips,
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
          await captureDualTheme(
            page,
            "row_modal_validation_error",
            results,
            dialogClips,
          );

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
            dialogClips,
          );
        }

        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }

      // 2. RowModal in Edit Mode (fields populated, read-only/disabled PK, delete button)
      console.log("  - RowModal Edit Mode...");
      const editOpened = await page.evaluate(() => {
        const el =
          Array.from(document.querySelectorAll("[data-table-workspace]")).find(
            (node) => {
              const r = node.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            },
          ) || document.querySelector("[data-table-workspace]");
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

        await captureDualTheme(page, "row_modal_edit", results, dialogClips);

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
            dialogClips,
          );

          // 3. RowDeleteDialog (edit mode -> click Delete)
          await deleteBtn.click();
          const deleteAlertDialog = page.locator('[role="alertdialog"]');
          await deleteAlertDialog
            .waitFor({ state: "visible", timeout: 5000 })
            .catch(() => {});
          await page.waitForTimeout(300);

          const isDeleteVisible = await deleteAlertDialog.isVisible();
          console.log(`  - RowDeleteDialog (visible=${isDeleteVisible})...`);
          if (isDeleteVisible) {
            await captureDualTheme(
              page,
              "row_modal_delete_dialog",
              results,
              dialogClips,
            );

            const delCancelBtn = deleteAlertDialog
              .getByRole("button", { name: /Cancel|Hủy/i })
              .first();
            if (await delCancelBtn.isVisible()) {
              await captureHoverDualTheme(
                page,
                delCancelBtn,
                "row_modal_delete_dialog_cancel_btn",
                results,
                dialogClips,
              );
            }

            const delConfirmBtn = deleteAlertDialog
              .getByRole("button", { name: /Delete Record|Xóa bản ghi/i })
              .first();
            if (await delConfirmBtn.isVisible()) {
              await captureHoverDualTheme(
                page,
                delConfirmBtn,
                "row_modal_delete_dialog_confirm_btn",
                results,
                dialogClips,
              );
            }

            if (await delCancelBtn.isVisible()) {
              await delCancelBtn.click();
              await deleteAlertDialog
                .waitFor({ state: "hidden", timeout: 3000 })
                .catch(() => {});
              await page.waitForTimeout(300);
            } else {
              await page.keyboard.press("Escape");
              await page.waitForTimeout(300);
            }
          }
        }

        // 4. RowDiffDialog (edit mode -> change a value -> click Save Changes)
        console.log("  - RowDiffDialog...");
        const titleInput = page
          .locator('[role="dialog"] input[type="text"]')
          .first();
        if (await titleInput.isVisible()) {
          await titleInput.fill("Sample Title Updated");
          await page.waitForTimeout(150);

          const editSaveBtn = page
            .locator('[role="dialog"]')
            .getByRole("button", { name: /Save Changes|Lưu thay đổi|Save/i })
            .first();
          if (await editSaveBtn.isVisible()) {
            await editSaveBtn.click();
            const diffAlertDialog = page.locator('[role="alertdialog"]');
            await diffAlertDialog
              .waitFor({ state: "visible", timeout: 5000 })
              .catch(() => {});
            await page.waitForTimeout(300);

            const isDiffVisible = await diffAlertDialog.isVisible();
            console.log(`  - RowDiffDialog (visible=${isDiffVisible})...`);
            if (isDiffVisible) {
              await captureDualTheme(
                page,
                "row_modal_diff_dialog",
                results,
                dialogClips,
              );

              const diffCancelBtn = diffAlertDialog
                .getByRole("button", { name: /Cancel|Hủy/i })
                .first();
              if (await diffCancelBtn.isVisible()) {
                await captureHoverDualTheme(
                  page,
                  diffCancelBtn,
                  "row_modal_diff_dialog_cancel_btn",
                  results,
                  dialogClips,
                );
              }

              const diffConfirmBtn = diffAlertDialog
                .getByRole("button", { name: /Confirm & Save|Xác nhận & Lưu/i })
                .first();
              if (await diffConfirmBtn.isVisible()) {
                await captureHoverDualTheme(
                  page,
                  diffConfirmBtn,
                  "row_modal_diff_dialog_confirm_btn",
                  results,
                  dialogClips,
                );
              }

              if (await diffCancelBtn.isVisible()) {
                await diffCancelBtn.click();
                await diffAlertDialog
                  .waitFor({ state: "hidden", timeout: 3000 })
                  .catch(() => {});
                await page.waitForTimeout(300);
              } else {
                await page.keyboard.press("Escape");
                await page.waitForTimeout(300);
              }
            }
          }
        }

        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }

      // 5. RowModal Long Label + FK + Nullable badges (fk_long_labels fixture)
      console.log("  - RowModal Long Label / FK + Nullable Badges...");
      const fkNode = page.getByRole("treeitem", { name: /fk_long_labels/i });
      await fkNode.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      if (await fkNode.isVisible()) {
        await fkNode.scrollIntoViewIfNeeded().catch(() => {});
        await fkNode.click();
        await page.waitForTimeout(1000);

        const addRowBtnFk = page
          .getByRole("button", { name: /Add row|Thêm hàng|Insert/i })
          .first();
        await addRowBtnFk
          .waitFor({ state: "visible", timeout: 8000 })
          .catch(() => {});
        if (await addRowBtnFk.isVisible()) {
          await addRowBtnFk.click();
          await page
            .locator('[role="dialog"]')
            .waitFor({ state: "visible", timeout: 5000 })
            .catch(() => {});
          await page.waitForTimeout(500);

          await captureDualTheme(
            page,
            "row_modal_fk_long_label",
            results,
            dialogClips,
          );
          await page.keyboard.press("Escape");
          await page.waitForTimeout(400);
        }
      }
    }

    // ==========================================
    // GROUP: ANALYTICS (ColumnAnalyticsDrawer)
    // ==========================================
    if (shouldRunGroup("analytics")) {
      console.log(
        "\n[Group: analytics] Capturing ColumnAnalyticsDrawer states...",
      );

      // Ensure tree is expanded and navigate to sample_records
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

      const ageHeader = page
        .locator('[data-tour="datagrid-view"] th:visible')
        .filter({ has: page.locator("span", { hasText: /^age$/ }) })
        .first();
      await ageHeader.waitFor({ state: "visible", timeout: 8000 });

      {
        let aggregateMode = "normal"; // "normal" | "hold" | "empty"
        const heldAggregateRoutes = [];
        let aggregateSettledResponses = 0;

        const aggregateRoutePattern =
          "**/api/connections/*/tables/*/aggregate*";
        await page.route(aggregateRoutePattern, async (route) => {
          if (aggregateMode === "hold") {
            heldAggregateRoutes.push(route);
            return;
          }
          if (aggregateMode === "empty") {
            aggregateSettledResponses++;
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                labels: [],
                values: [],
                stats: {
                  total_rows: 0,
                  non_null_count: 0,
                  null_count: 0,
                },
              }),
            });
            return;
          }
          try {
            const response = await route.fetch();
            const reqUrl = new URL(route.request().url());
            if (
              response.status() >= 500 &&
              reqUrl.searchParams.get("function") === "stats"
            ) {
              // SQLite adapter scans MIN/MAX into sql.NullFloat64 on stats calls for non-numeric columns (e.g. DATETIME),
              // returning 500 even when distribution and timeseries succeed. Fallback strictly keeps real distribution/timeseries intact.
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                  labels: ["Non-Null", "Null"],
                  values: [1, 0],
                  stats: {
                    total_rows: 1,
                    non_null_count: 1,
                    null_count: 0,
                  },
                }),
              });
            } else {
              await route.fulfill({ response });
            }
          } catch {
            await route.continue().catch(() => {});
          } finally {
            aggregateSettledResponses++;
          }
        });

        const waitForAggregateBatch = async (
          prevCount,
          expected = 3,
          timeout = 8000,
        ) => {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            if (aggregateSettledResponses >= prevCount + expected) return;
            await page.waitForTimeout(50);
          }
        };

        try {
          // 1. Open Column Analytics on numeric column `age` in held-loading state
          console.log("  - Analytics Loading State...");
          aggregateMode = "hold";
          await ageHeader.scrollIntoViewIfNeeded().catch(() => {});
          await ageHeader.hover({ force: true });
          await page.waitForTimeout(150);

          const colOptionsBtn = ageHeader.locator(
            'button[title="Column Options"]',
          );
          await colOptionsBtn.click({ force: true });

          const openAnalyticsItem = page
            .locator('[role="menuitem"]')
            .filter({ hasText: /Column Analytics/i })
            .first();
          await openAnalyticsItem.waitFor({ state: "visible", timeout: 5000 });
          await openAnalyticsItem.click();
          await page.mouse.move(0, 0).catch(() => {});

          const drawer = page.locator(
            '[data-testid="column-analytics-drawer"]',
          );
          await drawer
            .getByText(/Computing metrics for age/i)
            .waitFor({ state: "visible", timeout: 10000 });
          await page.waitForTimeout(200);
          await captureDualTheme(page, "analytics_loading", results);

          // 2. Release aggregate requests and capture loaded numeric column (`age`)
          console.log("  - Analytics Numeric Column (age)...");
          const beforeNumeric = aggregateSettledResponses;
          aggregateMode = "normal";
          while (heldAggregateRoutes.length > 0) {
            const held = heldAggregateRoutes.shift();
            try {
              const response = await held.fetch();
              await held.fulfill({ response });
            } catch {
              await held.continue().catch(() => {});
            } finally {
              aggregateSettledResponses++;
            }
          }
          await waitForAggregateBatch(beforeNumeric, 2);
          await drawer
            .getByText(/Numeric Summary Statistics/i)
            .waitFor({ state: "visible", timeout: 8000 });
          await waitForAnalyticsSettled(page);
          await captureDualTheme(page, "analytics_numeric", results);

          // 3. Column-switcher dropdown open
          console.log("  - Analytics Column Switcher Dropdown...");
          const switchColBtn = drawer.locator('button[title="Switch Column"]');
          await switchColBtn.waitFor({ state: "visible", timeout: 5000 });
          await switchColBtn.click();
          const createdAtMenuItem = page
            .locator('[role="menuitem"]')
            .filter({
              has: page.locator("span", { hasText: /^created_at$/ }),
            })
            .first();
          await createdAtMenuItem.waitFor({ state: "visible", timeout: 5000 });
          await page.mouse.move(0, 0).catch(() => {});
          await page.waitForTimeout(200);
          await captureDualTheme(
            page,
            "analytics_column_switcher_open",
            results,
          );

          // 4. Switch to date column (`created_at`) -> Day bucket + toggle hovers
          console.log("  - Analytics Date Column (created_at) & Toggles...");
          const beforeDate = aggregateSettledResponses;
          await createdAtMenuItem.click();
          await page.mouse.move(0, 0).catch(() => {});
          await waitForAggregateBatch(beforeDate, 3);
          await drawer
            .getByText(/Time-Series Trend/i)
            .waitFor({ state: "visible", timeout: 8000 });
          await waitForAnalyticsSettled(page);
          await captureDualTheme(page, "analytics_date_day", results);

          const dayBtn = drawer.getByRole("button", { name: /^Day$/i });
          const weekBtn = drawer.getByRole("button", { name: /^Week$/i });
          const monthBtn = drawer.getByRole("button", {
            name: /^Month$/i,
          });

          await dayBtn.waitFor({ state: "visible", timeout: 5000 });
          await weekBtn.waitFor({ state: "visible", timeout: 5000 });
          await monthBtn.waitFor({ state: "visible", timeout: 5000 });

          await captureHoverDualTheme(
            page,
            dayBtn,
            "analytics_toggle_day_btn",
            results,
          );
          await captureHoverDualTheme(
            page,
            weekBtn,
            "analytics_toggle_week_btn",
            results,
          );
          await captureHoverDualTheme(
            page,
            monthBtn,
            "analytics_toggle_month_btn",
            results,
          );

          // 5. Week toggle
          const beforeWeek = aggregateSettledResponses;
          await weekBtn.click();
          await page.mouse.move(0, 0).catch(() => {});
          await waitForAggregateBatch(beforeWeek, 3);
          await waitForAnalyticsSettled(page);
          await captureDualTheme(page, "analytics_date_week", results);

          // 6. Month toggle
          const beforeMonth = aggregateSettledResponses;
          await monthBtn.click();
          await page.mouse.move(0, 0).catch(() => {});
          await waitForAggregateBatch(beforeMonth, 3);
          await waitForAnalyticsSettled(page);
          await captureDualTheme(page, "analytics_date_month", results);

          // 7. Empty state (intercept /aggregate on bucket switch back to Day)
          console.log("  - Analytics Empty State...");
          aggregateMode = "empty";
          const beforeEmpty = aggregateSettledResponses;
          await dayBtn.click();
          await page.mouse.move(0, 0).catch(() => {});
          await waitForAggregateBatch(beforeEmpty, 3);
          await drawer
            .getByText(/No data available for this column/i)
            .first()
            .waitFor({ state: "visible", timeout: 5000 });
          await waitForAnalyticsSettled(page);
          await captureDualTheme(page, "analytics_empty", results);
        } finally {
          aggregateMode = "normal";
          await page.unroute(aggregateRoutePattern).catch(() => {});
          await page.keyboard.press("Escape").catch(() => {});
          await page
            .locator('[data-testid="column-analytics-drawer"]')
            .waitFor({ state: "hidden", timeout: 3000 })
            .catch(() => {});
          await page.waitForTimeout(200);
        }
      }
    }

    fs.writeFileSync(
      path.join(outDir, "computed_styles.json"),
      JSON.stringify(results, null, 2),
    );
    fs.writeFileSync(
      path.join(outDir, "dialog_clips.json"),
      JSON.stringify(dialogClips, null, 2),
    );
    console.log(
      `\nSUCCESS: Capture finished! Saved ${Object.keys(results).length} states (${Object.keys(dialogClips).length} dialog clips) into ${outDir}`,
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
