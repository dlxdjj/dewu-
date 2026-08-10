import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH || "/dewu-",
};

for (const script of [
  "node_modules/next/dist/bin/next",
  "scripts/verify-export-paths.mjs",
]) {
  const args = script.includes("next") ? [script, "build"] : [script];
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
