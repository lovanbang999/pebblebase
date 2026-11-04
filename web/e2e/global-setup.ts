import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function globalSetup() {
  const seedScript = path.resolve(__dirname, "../../scripts/seed_e2e_db.py");
  const seedDb = path.resolve(__dirname, "../../testdata/e2e_seed.db");
  const authDir = path.resolve(__dirname, ".auth");

  // Ensure auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Generate the 550-row test SQLite database
  execSync(`python3 "${seedScript}" "${seedDb}"`, { stdio: "inherit" });
  console.log(`[Global Setup] Prepared test SQLite seed database at ${seedDb}`);

  // Generate the 50,000-row performance benchmark database
  const perfSeedScript = path.resolve(__dirname, "../../scripts/seed_perf_db.py");
  const perfSeedDb = path.resolve(__dirname, "../../testdata/perf_50k.db");
  execSync(`python3 "${perfSeedScript}" "${perfSeedDb}"`, { stdio: "inherit" });
  console.log(`[Global Setup] Prepared performance benchmark SQLite database at ${perfSeedDb}`);
}

