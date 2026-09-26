import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// CLAUDE.md §18 Tier 2 item 3. `npm run test:e2e` runs against the local dev
// server (started if not already running) or E2E_BASE_URL.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const hasChrome =
  existsSync("/Applications/Google Chrome.app") || existsSync("/usr/bin/google-chrome") || existsSync("/opt/google/chrome/chrome");

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    // Use the installed Chrome when there is one, so no browser download is needed;
    // otherwise run `npx playwright install chromium` once.
    channel: hasChrome ? "chrome" : undefined,
    viewport: { width: 1400, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
