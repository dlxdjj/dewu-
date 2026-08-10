import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [fileURLToPath(new URL("./src/test/setup.ts", import.meta.url))],
    exclude: [
      "**/.deps/**",
      "**/.npm-cache/**",
      "**/.validation-*/**",
      "**/node_modules/**",
      "**/e2e/**",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/lib/types/**",
        "src/components/ui/icons.tsx",
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 55,
        branches: 70,
        functions: 55,
        lines: 55,
      },
    },
  },
});
