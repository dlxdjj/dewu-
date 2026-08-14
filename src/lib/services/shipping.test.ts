import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { allocateShippingCents } from "./shipping";

const candidates = [
  { id: "b", createdAt: "2026-01-01T00:00:00Z", currentShippingCents: 0 },
  { id: "a", createdAt: "2026-01-01T00:00:00Z", currentShippingCents: 0 },
  { id: "c", createdAt: "2026-01-02T00:00:00Z", currentShippingCents: 0 },
];

async function purchase(db: MemoryDbAdapter, quantity = 1) {
  return db.createPurchase({
    productName: "鞋", styleCode: `STYLE-SHIP-${quantity}-${crypto.randomUUID()}`,
    platform: "taobao", unitPriceCents: 100, quantity,
    purchasedAt: "2026-01-01", size: "42", initialStatus: "arrived",
    orderNo: "", note: "",
  });
}

describe("shipping", () => {
  it("allocates stable integer cents", () => {
    expect(allocateShippingCents(candidates, 1000)).toEqual([
      { unitId: "a", shippingCents: 334 },
      { unitId: "b", shippingCents: 333 },
      { unitId: "c", shippingCents: 333 },
    ]);
  });

  it("rolls back shipment and ledger together", async () => {
    const db = new MemoryDbAdapter();
    const created = await purchase(db, 3);
    const before = db.snapshot();
    db.injectFailureAfter(2);
    await expect(db.shipUnits({
      unitIds: created.unitIds, totalShippingCents: 1000,
      mode: "append", shippedAt: "2026-08-14",
    })).rejects.toThrow("注入事务故障");
    expect(db.snapshot()).toEqual(before);
  });

  it("records dated allocations and supports append then correction", async () => {
    const db = new MemoryDbAdapter();
    const created = await purchase(db, 2);
    await db.shipUnits({
      unitIds: created.unitIds, totalShippingCents: 3,
      mode: "append", shippedAt: "2026-08-10",
    });
    await db.shipUnits({
      unitIds: created.unitIds, totalShippingCents: 5,
      mode: "append", shippedAt: "2026-08-11",
    });
    expect(db.snapshot().units.map((unit) => unit.outbound_shipping_cents).sort()).toEqual([3, 5]);

    await db.shipUnits({
      unitIds: created.unitIds, totalShippingCents: 4,
      mode: "replace", shippedAt: "2026-08-12",
    });
    const state = db.snapshot();
    expect(state.units.map((unit) => unit.outbound_shipping_cents)).toEqual([2, 2]);
    expect(state.shippingEventItems.filter((item) => item.active)).toHaveLength(2);
    expect(state.shippingEvents).toHaveLength(3);
  });
});
