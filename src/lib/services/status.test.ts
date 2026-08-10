import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { batchChangeStatus, changeUnitStatus } from "./status";

const purchaseInput = {
  productName: "测试鞋",
  styleCode: "STATUS-INTEGRITY-1",
  platform: "taobao" as const,
  unitPriceCents: 10_000,
  quantity: 1,
  purchasedAt: "2026-08-10",
  size: "42",
  initialStatus: "arrived" as const,
  orderNo: "",
  note: "",
};

describe("status and sale integrity", () => {
  it("rejects financial states as purchase initial status", async () => {
    const db = new MemoryDbAdapter();
    await expect(
      db.createPurchase({ ...purchaseInput, initialStatus: "settled" }),
    ).rejects.toThrow("不能直接进入销售、结算或退款状态");
  });

  it("changes settled back to sold without retaining payout", async () => {
    const db = new MemoryDbAdapter();
    const purchase = await db.createPurchase(purchaseInput);
    await db.settleUnits({
      unitIds: purchase.unitIds,
      actualPayoutCents: 15_000,
      settledAt: "2026-08-10",
    });
    const settled = db.snapshot().units[0];

    await changeUnitStatus(db, settled, "sold");

    const state = db.snapshot();
    expect(state.units[0].status).toBe("sold");
    expect(state.sales).toHaveLength(1);
    expect(state.sales[0].actual_payout_cents).toBeNull();
    expect(state.sales[0].settled_at).toBeNull();
  });

  it("removes the old sale when a settled unit is shipped again", async () => {
    const db = new MemoryDbAdapter();
    const purchase = await db.createPurchase(purchaseInput);
    await db.settleUnits({
      unitIds: purchase.unitIds,
      actualPayoutCents: 15_000,
      settledAt: "2026-08-10",
    });

    await db.shipUnits({
      unitIds: purchase.unitIds,
      totalShippingCents: 800,
      overwriteConfirmed: false,
    });

    const state = db.snapshot();
    expect(state.units[0].status).toBe("shipping");
    expect(state.sales).toHaveLength(0);
  });

  it("skips units already at the batch target and rejects generic settlement", async () => {
    const db = new MemoryDbAdapter();
    const first = await db.createPurchase(purchaseInput);
    const second = await db.createPurchase({
      ...purchaseInput,
      styleCode: "STATUS-INTEGRITY-2",
      initialStatus: "pending",
    });
    const units = db.snapshot().units;

    await batchChangeStatus(db, units, "arrived");
    expect(db.snapshot().history).toHaveLength(3);
    expect(db.snapshot().units.map((unit) => unit.status)).toEqual([
      "arrived",
      "arrived",
    ]);

    await expect(
      batchChangeStatus(db, db.snapshot().units, "settled"),
    ).rejects.toThrow("录到手价");
    expect(first.unitIds).toHaveLength(1);
    expect(second.unitIds).toHaveLength(1);
  });
});
