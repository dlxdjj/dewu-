import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "./memory";
import { makeJoinedUnit } from "@/test/inventory-fixtures";
import type { InventoryUnit, Sale } from "@/lib/types/database";

function strip(unit: ReturnType<typeof makeJoinedUnit>): InventoryUnit {
  return {
    id: unit.id,
    user_id: unit.user_id,
    product_id: unit.product_id,
    batch_id: unit.batch_id,
    size: unit.size,
    unit_cost_cents: unit.unit_cost_cents,
    listing_price_cents: unit.listing_price_cents,
    outbound_shipping_cents: unit.outbound_shipping_cents,
    status: unit.status,
    created_at: unit.created_at,
    updated_at: unit.updated_at,
  };
}

describe("paged dashboard fallback", () => {
  it("paginates inventory groups and sorts by purchase date", async () => {
    const joined = Array.from({ length: 25 }, (_, index) => {
      const row = makeJoinedUnit({
        id: `u${index}`,
        productId: `p${index}`,
        styleCode: `STYLE-${index}`,
        status: "arrived",
      });
      row.product.name = `商品 ${index}`;
      row.batch.purchased_at = `2026-08-${String(index + 1).padStart(2, "0")}`;
      return row;
    });
    const db = new MemoryDbAdapter({
      products: joined.map((row) => row.product),
      batches: joined.map((row) => row.batch),
      units: joined.map(strip),
    });
    const first = await db.listInventoryGroupsPage({
      view: "active",
      status: "all",
      platform: "all",
      query: "",
      missingSizeOnly: false,
      sort: "purchase_desc",
      limit: 20,
      offset: 0,
    });
    const second = await db.listInventoryGroupsPage({
      view: "active",
      status: "all",
      platform: "all",
      query: "",
      missingSizeOnly: false,
      sort: "purchase_desc",
      limit: 20,
      offset: 20,
    });

    expect(first.groups).toHaveLength(20);
    expect(second.groups).toHaveLength(5);
    expect(first.totalGroups).toBe(25);
    expect(first.groups[0].purchasedAt).toBe("2026-08-25");
  });

  it("sorts settled groups by realized profit and returns loss-only details", async () => {
    const high = makeJoinedUnit({ id: "high", productId: "p-high", styleCode: "HIGH", status: "settled", cost: 10000 });
    const loss = makeJoinedUnit({ id: "loss", productId: "p-loss", styleCode: "LOSS", status: "settled", cost: 10000 });
    const sale = (id: string, unitId: string, payout: number): Sale => ({
      id,
      user_id: "u1",
      unit_id: unitId,
      sold_price_cents: null,
      platform_fee_cents: 0,
      platform_subsidy_cents: 0,
      express_fee_cents: 0,
      other_fee_cents: 0,
      actual_payout_cents: payout,
      sold_at: "2026-08-20",
      settled_at: "2026-08-21",
      created_at: "2026-08-20T00:00:00Z",
      updated_at: "2026-08-21T00:00:00Z",
    });
    const db = new MemoryDbAdapter({
      products: [high.product, loss.product],
      batches: [high.batch, loss.batch],
      units: [strip(high), strip(loss)],
      sales: [sale("s-high", "high", 18000), sale("s-loss", "loss", 8000)],
    });
    const inventory = await db.listInventoryGroupsPage({
      view: "sales",
      status: "all",
      platform: "all",
      query: "",
      missingSizeOnly: false,
      sort: "profit_desc",
      limit: 20,
      offset: 0,
    });
    const report = await db.getReportDashboard({
      month: "2026-08",
      lossesOnly: true,
      limit: 20,
      offset: 0,
    });

    expect(inventory.groups.map((group) => group.styleCode)).toEqual(["HIGH", "LOSS"]);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].product.style_code).toBe("LOSS");
    expect(report.rows[0].profit).toBe(-2000);
  });
});
