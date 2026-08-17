import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";

describe("later size assignment", () => {
  it("changes only sizes and preserves inventory count and cost", async () => {
    const db = new MemoryDbAdapter({
      preferences: {
        user_id: "test-user", workflow: "bulk", updated_at: "2026-08-17T00:00:00Z",
      },
    });
    const purchase = await db.createPurchase({
      productName: "测试鞋", styleCode: "SIZE-1", platform: "other",
      unitPriceCents: 19990, quantity: 3, purchasedAt: "2026-08-17",
      size: "", initialStatus: "arrived", orderNo: "", note: "",
    });
    const before = db.snapshot();
    await db.assignUnitSizes([
      { unitId: purchase.unitIds[0], size: "40" },
      { unitId: purchase.unitIds[1], size: "41" },
      { unitId: purchase.unitIds[2], size: "41" },
    ]);
    const after = db.snapshot();
    expect(after.units).toHaveLength(before.units.length);
    expect(after.units.reduce((sum, unit) => sum + unit.unit_cost_cents, 0))
      .toBe(before.units.reduce((sum, unit) => sum + unit.unit_cost_cents, 0));
    expect(after.units.map((unit) => unit.size)).toEqual(["40", "41", "41"]);
  });
});
