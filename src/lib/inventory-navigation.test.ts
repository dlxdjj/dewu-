import { describe, expect, it } from "vitest";
import {
  inventoryReturnHref,
  inventoryReturnLabel,
  safeInventoryDetailReturn,
  safeInventoryHref,
} from "./inventory-navigation";

describe("inventory return navigation", () => {
  it("preserves the current tab, filters, sort, search, and loaded page size", () => {
    const href = inventoryReturnHref({
      view: "sales",
      status: "all",
      platform: "pdd",
      query: "KS4244",
      missingSizeOnly: false,
      sort: "profit_desc",
      loaded: 40,
    });
    expect(href).toBe(
      "/inventory?view=sales&platform=pdd&q=KS4244&sort=profit_desc&loaded=40",
    );
    expect(inventoryReturnLabel(href)).toBe("销售记录");
  });

  it("rejects external return destinations", () => {
    expect(safeInventoryHref("https://evil.example/inventory"))
      .toBe("/inventory?view=active");
    expect(safeInventoryDetailReturn("//evil.example/inventory/group"))
      .toBe("/inventory?view=active");
  });
});
