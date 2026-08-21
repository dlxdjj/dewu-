import { describe, expect, it } from "vitest";
import {
  cachedProductImageUrl,
  productImageCacheKey,
  rememberDisplayedProductImage,
} from "./product-image-cache";

describe("product image cache", () => {
  it("uses the stable storage path instead of the expiring signature", () => {
    expect(
      productImageCacheKey(
        "https://example.supabase.co/storage/v1/object/sign/attachments/user-1/product/p-1/photo?token=temporary",
      ),
    ).toBe("user-1/product/p-1/photo");
    expect(productImageCacheKey("blob:https://example.com/local")).toBeNull();
  });

  it("falls back safely when IndexedDB is unavailable", async () => {
    await expect(cachedProductImageUrl("missing")).resolves.toBeNull();
    await expect(
      rememberDisplayedProductImage("https://example.com/image.jpg"),
    ).resolves.toBeUndefined();
  });
});
