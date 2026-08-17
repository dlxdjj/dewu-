import { describe, expect, it } from "vitest";
import type {
  InventoryUnit,
  MonthlyRebate,
  Product,
  PurchaseBatch,
  Sale,
} from "@/lib/types/database";
import {
  buildCsv,
  buildSettlementReport,
  type ReportInput,
} from "./reports";

const timestamp = "2026-07-01T00:00:00Z";

function reportInput(month = "2026-08"): ReportInput {
  const products: Product[] = [
    {
      id: "p1",
      user_id: "u1",
      name: "测试鞋",
      style_code: "STYLE-001",
      brand: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  const batches: PurchaseBatch[] = [
    {
      id: "b1",
      user_id: "u1",
      product_id: "p1",
      platform: "taobao",
      order_no: null,
      unit_price_cents: 8000,
      quantity: 1,
      shipping_fee_cents: 0,
      discount_amount_cents: 0,
      purchased_at: "2026-08-01",
      note: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: "b2",
      user_id: "u1",
      product_id: "p1",
      platform: "pdd",
      order_no: null,
      unit_price_cents: 7000,
      quantity: 1,
      shipping_fee_cents: 0,
      discount_amount_cents: 0,
      purchased_at: "2026-07-01",
      note: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  const units: InventoryUnit[] = [
    {
      id: "u1",
      user_id: "u1",
      product_id: "p1",
      batch_id: "b1",
      size: "42",
      unit_cost_cents: 8000,
      listing_price_cents: null,
      outbound_shipping_cents: 500,
      status: "settled",
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: "u2",
      user_id: "u1",
      product_id: "p1",
      batch_id: "b2",
      size: "42",
      unit_cost_cents: 7000,
      listing_price_cents: null,
      outbound_shipping_cents: 0,
      status: "settled",
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  const sale = (
    id: string,
    unitId: string,
    payout: number,
    date: string,
  ): Sale => ({
    id,
    user_id: "u1",
    unit_id: unitId,
    sold_price_cents: 0,
    platform_fee_cents: 0,
    platform_subsidy_cents: 0,
    express_fee_cents: 0,
    other_fee_cents: 0,
    actual_payout_cents: payout,
    sold_at: date,
    settled_at: date,
    created_at: timestamp,
    updated_at: timestamp,
  });
  const rebate = (
    id: string,
    source: MonthlyRebate["source"],
    rebateMonth: string,
    amountCents: number,
  ): MonthlyRebate => ({
    id,
    user_id: "u1",
    month: `${rebateMonth}-01`,
    source,
    amount_cents: amountCents,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return {
    units,
    products,
    batches,
    sales: [
      sale("s1", "u1", 12000, "2026-08-03"),
      sale("s2", "u2", 12000, "2026-07-31"),
    ],
    rebates: [
      rebate("r1", "taobao_alliance", "2026-08", 1000),
      rebate("r2", "jingfen", "2026-07", 2000),
    ],
    shippingEvents: [],
    shippingEventItems: [],
    month,
  };
}

describe("settlement reports", () => {
  it("separates all-time and selected-month settled totals", () => {
    const report = buildSettlementReport(reportInput());

    expect(report.allTime).toEqual({
      profitCents: 11500,
      rebateCents: 3000,
      salesCents: 24000,
      salesCount: 2,
      shippingCents: 0,
    });
    expect(report.selectedMonth).toEqual({
      profitCents: 4500,
      rebateCents: 1000,
      salesCents: 12000,
      salesCount: 1,
      shippingCents: 0,
    });
    expect(report.rows).toHaveLength(1);
  });

  it("sums only active shipping allocations by shipping month", () => {
    const input = reportInput();
    input.shippingEvents = [
      {
        id: "e1", user_id: "u1", shipped_at: "2026-08-02",
        total_shipping_cents: 900, mode: "append", estimated: false,
        note: null, created_at: timestamp, updated_at: timestamp,
      },
      {
        id: "e2", user_id: "u1", shipped_at: "2026-07-02",
        total_shipping_cents: 500, mode: "replace", estimated: false,
        note: null, created_at: timestamp, updated_at: timestamp,
      },
    ];
    input.shippingEventItems = [
      { id: "i1", user_id: "u1", event_id: "e1", unit_id: "u1", allocated_shipping_cents: 900, active: true, voided_at: null, created_at: timestamp },
      { id: "i2", user_id: "u1", event_id: "e2", unit_id: "u1", allocated_shipping_cents: 500, active: false, voided_at: timestamp, created_at: timestamp },
    ];

    const report = buildSettlementReport(input);
    expect(report.selectedMonth.shippingCents).toBe(900);
    expect(report.allTime.shippingCents).toBe(900);
  });

  it("excludes refunded and missing-payout rows", () => {
    const input = reportInput();
    input.units[0].status = "refunded";
    input.sales[1].actual_payout_cents = null;

    const report = buildSettlementReport(input);

    expect(report.allTime).toEqual({
      profitCents: 3000,
      rebateCents: 3000,
      salesCents: 0,
      salesCount: 0,
      shippingCents: 0,
    });
  });

  it("exports historical and selected-month summaries before detail", () => {
    const report = buildSettlementReport(reportInput());
    const csv = buildCsv(report, "2026-08");

    expect(csv).toContain("范围,利润(分),返利收入(分),运费支出(分),销售额(分),销量");
    expect(csv).toContain("历史累计,11500,3000,0,24000,2");
    expect(csv).toContain("2026-08,4500,1000,0,12000,1");
    expect(csv).toContain("测试鞋,42,8000,500,12000,3500,2026-08-03");
    expect(csv).toContain("淘宝联盟,2026-08,1000");
  });

  it("excludes rebates from bulk-account profit and CSV exports", () => {
    const input = reportInput();
    input.includeRebates = false;

    const report = buildSettlementReport(input);
    const csv = buildCsv(report, "2026-08", { includeRebates: false });

    expect(report.allTime).toEqual({
      profitCents: 8500,
      rebateCents: 0,
      salesCents: 24000,
      salesCount: 2,
      shippingCents: 0,
    });
    expect(report.selectedMonth).toEqual({
      profitCents: 3500,
      rebateCents: 0,
      salesCents: 12000,
      salesCount: 1,
      shippingCents: 0,
    });
    expect(report.rebates).toEqual([]);
    expect(csv).toContain("范围,利润(分),运费支出(分),销售额(分),销量");
    expect(csv).toContain("历史累计,8500,0,24000,2");
    expect(csv).not.toContain("返利");
  });
});
