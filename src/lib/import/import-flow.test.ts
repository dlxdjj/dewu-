import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";

const timestamp = "2026-08-17T00:00:00Z";

describe("bulk account import flow", () => {
  it("matches canonical name and image identity by normalized style code", async () => {
    const db = new MemoryDbAdapter({
      preferences: { user_id: "test-user", workflow: "bulk", updated_at: timestamp },
      catalogProducts: [{
        id: "catalog-1",
        normalized_style_code: "HP-5969",
        display_style_code: "HP-5969",
        canonical_name: "阿迪达斯 HP5969 运动鞋",
        image_path: "owner/product/image",
        source_user_id: "owner",
        verified_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      }],
    });
    const result = await db.importPurchases({
      fileHash: "a".repeat(64),
      purchasedAt: "2026-08-17",
      rows: [{
        rowNumber: 2, styleCode: " hp‑5969 ", productName: "表格旧名称",
        quantity: 2, unitPriceCents: 39990, size: "",
      }],
    });
    const state = db.snapshot();
    expect(result).toMatchObject({ rowCount: 1, unitCount: 2, matchedRows: 1 });
    expect(state.products[0]).toMatchObject({
      name: "阿迪达斯 HP5969 运动鞋",
      catalog_product_id: "catalog-1",
    });
    expect(state.batches[0].platform).toBe("other");
    expect(state.units.map((unit) => unit.size)).toEqual(["", ""]);
    expect(state.units.every((unit) => unit.status === "arrived")).toBe(true);
  });

  it("rejects a repeated file without adding inventory", async () => {
    const db = new MemoryDbAdapter({
      preferences: { user_id: "test-user", workflow: "bulk", updated_at: timestamp },
    });
    const input = {
      fileHash: "b".repeat(64), purchasedAt: "2026-08-17",
      rows: [{ rowNumber: 2, styleCode: "AB-1", productName: "测试鞋", quantity: 1, unitPriceCents: 10000, size: "42" }],
    };
    await db.importPurchases(input);
    await expect(db.importPurchases(input)).rejects.toThrow("已经导入过");
    expect(db.snapshot().units).toHaveLength(1);
  });
});
