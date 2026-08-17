import { describe, expect, it, vi } from "vitest";
import type { Attachment, Product } from "@/lib/types/database";
import { MemoryDbAdapter } from "@/lib/data/memory";
import {
  findProductByStyleCode,
  latestProductImageByOwner,
  loadProductImageUrls,
  normalizeStyleCode,
} from "./catalog";

const timestamp = "2026-08-01T00:00:00Z";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    user_id: "u1",
    name: "测试鞋",
    style_code: "AB-01",
    brand: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "a1",
    user_id: "u1",
    owner_type: "product",
    owner_id: "p1",
    kind: "product_image",
    path: "image",
    content_type: "image/jpeg",
    created_at: timestamp,
    ...overrides,
  };
}

describe("catalog", () => {
  it("normalizes and finds style codes without case or edge spaces", () => {
    expect(normalizeStyleCode("  Ab-01 ")).toBe("AB-01");
    expect(
      findProductByStyleCode([product()], " ab-01 ")?.id,
    ).toBe("p1");
    expect(findProductByStyleCode([product()], "   ")).toBeUndefined();
  });

  it("keeps only the newest product image for each product", () => {
    const latest = latestProductImageByOwner([
      attachment({ id: "old", path: "old" }),
      attachment({
        id: "new",
        path: "new",
        created_at: "2026-08-02T00:00:00Z",
      }),
      attachment({
        id: "order",
        kind: "order_screenshot",
        path: "order",
        created_at: "2026-08-03T00:00:00Z",
      }),
    ]);

    expect(latest.get("p1")?.path).toBe("new");
  });

  it("isolates one signed URL failure from other products", async () => {
    const db = {
      listAttachments: vi.fn().mockResolvedValue([
        attachment({ owner_id: "p1", path: "ok" }),
        attachment({ id: "a2", owner_id: "p2", path: "bad" }),
      ]),
      attachmentUrl: vi
        .fn()
        .mockImplementation((row: Attachment) =>
          row.path === "ok"
            ? Promise.resolve("https://signed.example/ok")
            : Promise.reject(new Error("sign failed")),
        ),
      listCatalogProducts: vi.fn().mockResolvedValue([]),
      catalogImageUrl: vi.fn(),
    };

    await expect(loadProductImageUrls(db, [
      product({ id: "p1" }),
      product({ id: "p2" }),
    ])).resolves.toEqual(
      new Map([["p1", "https://signed.example/ok"]]),
    );
    expect(db.listAttachments).toHaveBeenCalledWith("product");
  });

  it("lists every attachment for an owner type when owner id is omitted", async () => {
    const db = new MemoryDbAdapter({
      attachments: [
        attachment({ id: "p1-image", owner_id: "p1" }),
        attachment({ id: "p2-image", owner_id: "p2" }),
        attachment({ id: "unit-image", owner_type: "unit", owner_id: "u1" }),
      ],
    });

    await expect(db.listAttachments("product")).resolves.toHaveLength(2);
  });
});
