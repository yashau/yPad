import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000, // 2 minutes for tests with many browser contexts
  use: {
    baseURL: "http://127.0.0.1:8787",
    screenshot: "only-on-failure",
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command:
      "node scripts/writeWranglerConfig.mjs && wrangler d1 migrations apply ypad-db --local && vite build && wrangler dev --local --persist-to .wrangler/state",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
