import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupPageEnvironment, dismissWelcomeIfVisible } from "./test-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.resolve(__dirname, ".auth/admin.json");
const seedDbPath = path.resolve(__dirname, "../../testdata/e2e_seed.db");
const perfDbPath = path.resolve(__dirname, "../../testdata/perf_50k.db");

setup("authenticate and initialize test environment", async ({ page, request }) => {
  await setupPageEnvironment(page);
  await page.goto("/");

  const passwordInput = page.getByPlaceholder("••••••••");
  await expect(passwordInput).toBeVisible({ timeout: 15000 });

  await passwordInput.fill("pebblebase");
  const signInButton = page.getByRole("button", { name: /Sign In/i });
  await expect(signInButton).toBeEnabled();
  await signInButton.click();

  await dismissWelcomeIfVisible(page);

  const newConnBtn = page.getByRole("button", { name: /New connection/i }).first();
  await expect(newConnBtn).toBeVisible({ timeout: 20000 });

  const token = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("pebblebase-auth");
      return raw ? JSON.parse(raw).state?.token : null;
    } catch {
      return null;
    }
  });
  expect(token).toBeTruthy();

  // Pre-create "E2E Seed SQLite" connection via API if not exists
  const checkRes = await request.get("/api/connections", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const connections: any[] = checkRes.ok() ? await checkRes.json() : [];
  const existing = connections.find((c: any) => c.name === "E2E Seed SQLite");

  if (!existing) {
    const createRes = await request.post("/api/connections", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: {
        name: "E2E Seed SQLite",
        type: "sqlite",
        mode: "form",
        filepath: seedDbPath,
        save_password: false,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    console.log("[Auth Setup] Created 'E2E Seed SQLite' connection pointing to", seedDbPath);
  }

  const existingPerf = connections.find((c: any) => c.name === "Perf 50k SQLite");
  if (!existingPerf) {
    const createRes = await request.post("/api/connections", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: {
        name: "Perf 50k SQLite",
        type: "sqlite",
        mode: "form",
        filepath: perfDbPath,
        save_password: false,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    console.log("[Auth Setup] Created 'Perf 50k SQLite' connection pointing to", perfDbPath);
  }

  // Persist authenticated storage state
  await page.context().storageState({ path: authFile });
});
