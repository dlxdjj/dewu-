import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const secureMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/0002_simple_secure.sql",
);
const integrityMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/0004_state_integrity.sql",
);
const migration = [secureMigrationPath, integrityMigrationPath]
  .map((migrationPath) => fs.readFileSync(migrationPath, "utf8"))
  .join("\n");

function functionBody(name: string): string {
  const pattern = new RegExp(
    `create or replace function ${name}\\([^]*?\\$\\$;`,
    "gi",
  );
  const matches = [...migration.matchAll(pattern)];
  const latest = matches.at(-1)?.[0];
  if (!latest) throw new Error(`未找到函数 ${name}`);
  return latest;
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

  it("removes old sales when units leave a sale state through shipping", () => {
    const body = functionBody("ship_units");
    expect(body).toMatch(/delete from sales[^]*unit_id\s*=\s*v_row\.id/i);
  });

  it("creates an unsettled sale row when status changes to sold", () => {
    const body = functionBody("change_units_status");
    expect(body).toMatch(/p_to_status\s*=\s*'sold'[^]*insert into sales/i);
    expect(body).toMatch(/actual_payout_cents\s*=\s*null/i);
  });

  it("rejects special states as purchase initial status", () => {
    const body = functionBody("create_purchase_simple");
    expect(body).toMatch(
      /v_status not in \('pending','arrived','shipping','in_stock_dewu','returned'\)/i,
    );
  });
});
