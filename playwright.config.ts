import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const projectRoot = __dirname;
const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const executablePath = existsSync(systemChrome) ? systemChrome : undefined;
const port = Number(process.env.PLAYWRIGHT_PORT ?? "3000");
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/configuration.spec.ts",
  fullyParallel: false,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next dev "${projectRoot}" --hostname localhost --port ${port}`,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-test-key",
      NEXT_PUBLIC_AUTH_REDIRECT_URL: baseURL,
    },
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
  },
  projects: [
    {
      name: "chromium-390",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath },
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
