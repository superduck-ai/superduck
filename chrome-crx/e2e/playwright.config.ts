import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  outputDir: "./test-results",
  reporter: [["html", { outputFolder: "./playwright-report", open: "never" }]],
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
