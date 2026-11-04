import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60000,
  reporter: [["list"]],
  globalSetup: path.resolve(__dirname, "e2e/global-setup.ts"),
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: true,
    launchOptions: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(__dirname, "e2e/.auth/admin.json"),
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "rm -rf /tmp/pb_e2e_data && cd .. && DATA_DIR=/tmp/pb_e2e_data PORT=8080 PEBBLEBASE_JWT_SECRET=pebblebase-jwt-secret-for-e2e-testing-32b ./pebblebase",
    url: "http://localhost:8080/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
});

