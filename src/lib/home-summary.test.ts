import { describe, expect, it } from "vitest";
import type { UnitStatus } from "@/lib/constants/status";
import type { InventoryUnit, Sale } from "@/lib/types/database";
import { buildHomeSummary } from "./home-summary";

const timestamp = "2026-08-01T00:00:00Z";

function unit(
  id: string,
  status: UnitStatus,
  cost: number,
  shipping: number,
): InventoryUnit {
  return {
    id,
    user_id: "u1",
    batch_id: `b-${id}`,
    product_id: `p-${id}`,
    size: "42",
    unit_cost_cents: cost,
    listing_price_cents: null,
    outbound_shipping_cents: shipping,
    status,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function sale(unitId: string, payout: number, settledAt: string): Sale {
  return {
    id: `s-${unitId}`,
    user_id: "u1",
    unit_id: unitId,
    sold_price_cents: 0,
    platform_fee_cents: 0,
    platform_subsidy_cents: 0,
    express_fee_cents: 0,
    other_fee_cents: 0,
    actual_payout_cents: payout,
    sold_at: settledAt,
    settled_at: settledAt,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

describe("buildHomeSummary", () => {
  it("builds active inventory and current settled month metrics", () => {
    const summary = buildHomeSummary(
      [
        unit("active", "arrived", 10000, 0),
        unit("aug", "settled", 8000, 500),
        unit("jul", "settled", 7000, 0),
        unit("refund", "refunded", 9000, 0),
      ],
      [
        sale("aug", 12000, "2026-08-03"),
        sale("jul", 10000, "2026-07-31"),
        sale("refund", 20000, "2026-08-02"),
      ],
      new Date("2026-08-04T12:00:00+02:00"),
    );

    expect(summary).toEqual({
      inventoryCount: 1,
      inventoryCostCents: 10000,
      month: "2026-08",
      monthLabel: "8月",
      monthlySalesCount: 1,
      monthlyProfitCents: 3500,
    });
  });

  it("ignores a settlement without an actual payout", () => {
    const pendingSale = sale("sold", 12000, "2026-08-03");
    pendingSale.actual_payout_cents = null;

    expect(
      buildHomeSummary(
        [unit("sold", "sold", 8000, 0)],
        [pendingSale],
        new Date("2026-08-04T12:00:00+02:00"),
      ).monthlySalesCount,
    ).toBe(0);
  });
});
