import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/0002_simple_secure.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

function functionBody(name: string): string {
  const pattern = new RegExp(
    `create or replace function ${name}\\([^]*?\\$\\$;`,
    "i",
  );
  const match = migration.match(pattern);
  if (!match) throw new Error(`未找到函数 ${name}`);
  return match[0];
}

describe("secure migration RPC contracts", () => {
  it("prevents generic batch status RPC from bypassing refund confirmation", () => {
    const body = functionBody("change_units_status");
    expect(body).toMatch(/p_to_status\s*=\s*'refunded'[^]*raise exception/i);
  });

  it("prevents generic status RPC from creating settled units without payout", () => {
    const body = functionBody("change_units_status");
    expect(body).toMatch(/p_to_status\s*=\s*'settled'[^]*raise exception/i);
  });
});
