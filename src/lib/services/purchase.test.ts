import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { createPurchase } from "./purchase";

const form = {
  productName: "测试鞋",
  styleCode: "STYLE-001",
  platform: "taobao" as const,
  unitPriceYuan: "100",
  quantity: 1,
  purchasedAt: "2026-08-04",
  size: "42",
  initialStatus: "arrived" as const,
};

describe("purchase style code", () => {
  it("rejects a blank style code before creating business rows", async () => {
    const db = new MemoryDbAdapter();

    await expect(
      createPurchase(db, { ...form, styleCode: "   " }),
    ).rejects.toThrow("请填写货号");
    expect(db.snapshot().products).toHaveLength(0);
    expect(db.snapshot().units).toHaveLength(0);
  });

  it("enforces the same rule at the adapter boundary", async () => {
    const db = new MemoryDbAdapter();

    await expect(
      db.createPurchase({
        productName: "测试鞋",
        styleCode: " ",
        platform: "taobao",
        unitPriceCents: 10000,
        quantity: 1,
        purchasedAt: "2026-08-04",
        size: "42",
        initialStatus: "arrived",
        orderNo: "",
        note: "",
      }),
    ).rejects.toThrow("请填写货号");
    expect(db.snapshot().products).toHaveLength(0);
  });

  it("trims and reuses a product with the same case-insensitive style code", async () => {
    const db = new MemoryDbAdapter();

    const first = await createPurchase(db, form);
    const second = await createPurchase(db, {
      ...form,
      productName: "同款补货",
      styleCode: " style-001 ",
    });

    expect(second.productId).toBe(first.productId);
    expect(db.snapshot().products).toHaveLength(1);
    expect(db.snapshot().products[0].style_code).toBe("STYLE-001");
  });
});
