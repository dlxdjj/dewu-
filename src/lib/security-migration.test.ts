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
const rebateMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/0005_monthly_rebates.sql",
);
const shippingMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/0006_shipping_events.sql",
);
const importMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/0007_account_import_catalog_sizes.sql",
);
const rebateGuardMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/0008_bulk_rebate_guard.sql",
);
const migration = [secureMigrationPath, integrityMigrationPath, rebateMigrationPath, shippingMigrationPath, importMigrationPath, rebateGuardMigrationPath]
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

  it("prevents generic status RPC from bypassing freight entry", () => {
    const body = functionBody("change_units_status");
    expect(body).toMatch(/p_to_status\s*=\s*'shipping'[^]*raise exception/i);
  });

  it("removes old sales when units leave a sale state through shipping", () => {
    const body = functionBody("record_shipment");
    expect(body).toMatch(/delete from sales[^]*unit_id\s*=\s*v_row\.id/i);
  });

  it("records owned dated shipping allocations atomically", () => {
    const body = functionBody("record_shipment");
    expect(body).toMatch(/v_uid uuid := require_uid\(\)/i);
    expect(body).toMatch(/insert into shipping_events/i);
    expect(body).toMatch(/insert into shipping_event_items/i);
    expect(body).toMatch(/p_mode not in \('append','replace'\)/i);
  });

  it("creates an unsettled sale row when status changes to sold", () => {
    const body = functionBody("change_units_status");
    expect(body).toMatch(/p_to_status\s*=\s*'sold'[^]*insert into sales/i);
    expect(body).toMatch(/actual_payout_cents\s*=\s*null/i);
  });

  it("rejects special states as purchase initial status", () => {
    const body = functionBody("create_purchase_simple");
    expect(body).toMatch(
      /v_status not in \('pending','arrived','in_stock_dewu','returned'\)/i,
    );
  });

  it("saves both owned rebate sources atomically", () => {
    const body = functionBody("save_monthly_rebates");
    expect(body).toMatch(/v_uid uuid := require_uid\(\)/i);
    expect(body).toMatch(/account_preferences[^]*workflow = 'standard'/i);
    expect(body).toMatch(/raise exception 'REBATE_NOT_AVAILABLE'/i);
    expect(body).toMatch(/p_taobao_alliance_cents\s*<\s*0/i);
    expect(body).toMatch(/p_jingfen_cents\s*<\s*0/i);
    expect(body).toMatch(/on conflict\(user_id,month,source\)/i);
  });

  it("clears monthly rebates with all other account data", () => {
    const body = functionBody("clear_all_data");
    expect(body).toMatch(/delete from monthly_rebates where user_id = v_uid/i);
    expect(body).toMatch(/'rebates',c_rebates/i);
    expect(body).toMatch(/delete from shipping_events where user_id = v_uid/i);
  });

  it("keeps spreadsheet imports atomic, owned, and limited to bulk accounts", () => {
    const body = functionBody("import_purchases_from_spreadsheet");
    expect(body).toMatch(/v_uid uuid := require_uid\(\)/i);
    expect(body).toMatch(/workflow = 'bulk'/i);
    expect(body).toMatch(/jsonb_array_length\(p_rows\) > 1000/i);
    expect(body).toMatch(/v_units \+ v_qty > 5000/i);
    expect(body).toMatch(/unique_violation[^]*SPREADSHEET_ALREADY_IMPORTED/i);
  });

  it("shares only verified catalog metadata while keeping inventory writes owned", () => {
    const body = functionBody("import_purchases_from_spreadsheet");
    expect(body).toMatch(/from catalog_products[^]*normalized_style_code/i);
    expect(body).toMatch(/insert into products\(user_id[^]*v_uid/i);
    expect(body).toMatch(/insert into inventory_units\([^]*user_id[^]*v_uid/i);
  });

  it("assigns sizes without creating or deleting inventory rows", () => {
    const body = functionBody("assign_unit_sizes");
    expect(body).toMatch(/update inventory_units[^]*set size = v_size/i);
    expect(body).not.toMatch(/insert into inventory_units/i);
    expect(body).not.toMatch(/delete from inventory_units/i);
  });
});
