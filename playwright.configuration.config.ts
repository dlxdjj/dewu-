import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const projectRoot = __dirname;
const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const executablePath = existsSync(systemChrome) ? systemChrome : undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "configuration.spec.ts",
  fullyParallel: false,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next start "${projectRoot}" --hostname localhost --port 3000`,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_AUTH_REDIRECT_URL: "http://localhost:3000",
    },
    url: "http://localhost:3000",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium-390-unconfigured",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath },
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
