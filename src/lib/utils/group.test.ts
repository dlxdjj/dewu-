import { describe, expect, it } from "vitest";
import { makeJoinedUnit } from "@/test/inventory-fixtures";
import {
  buildGroups,
  filterUnitsByPlatform,
  groupQuery,
  matchesGroup,
} from "./group";

describe("inventory grouping", () => {
  it("filters platform before grouping style and size", () => {
    const units = [
      makeJoinedUnit({
        id: "u1",
        styleCode: " AB-1 ",
        size: "42",
        platform: "taobao",
        cost: 100,
        status: "arrived",
      }),
      makeJoinedUnit({
        id: "u2",
        styleCode: "ab-1",
        size: "42 ",
        platform: "taobao",
        cost: 200,
        status: "shipping",
      }),
      makeJoinedUnit({
        id: "u3",
        styleCode: "AB-1",
        size: "42",
        platform: "pdd",
        cost: 300,
        status: "pending",
      }),
    ];

    const taobao = buildGroups(filterUnitsByPlatform(units, "taobao"));
    expect(taobao).toHaveLength(1);
    expect(taobao[0].units.map((unit) => unit.id)).toEqual(["u1", "u2"]);
    expect(taobao[0].totalCostCents).toBe(300);
    expect(taobao[0].platforms).toEqual(["taobao"]);
    expect(taobao[0].statusCounts).toEqual({ arrived: 1, shipping: 1 });

    const all = buildGroups(units);
    expect(all).toHaveLength(1);
    expect(all[0].units).toHaveLength(3);
    expect(all[0].platforms).toEqual(["taobao", "pdd"]);
  });

  it("does not merge unrelated historical products with blank style codes", () => {
    const groups = buildGroups([
      makeJoinedUnit({
        id: "u1",
        productId: "p1",
        styleCode: null,
        size: "42",
      }),
      makeJoinedUnit({
        id: "u2",
        productId: "p2",
        styleCode: null,
        size: "42",
      }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("keeps different sizes in different groups", () => {
    const groups = buildGroups([
      makeJoinedUnit({ id: "u1", styleCode: "AB-1", size: "42" }),
      makeJoinedUnit({ id: "u2", styleCode: "ab-1", size: "43" }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("round-trips style size and optional platform through group matching", () => {
    const group = buildGroups([
      makeJoinedUnit({ styleCode: "AB/1", size: "42.5", platform: "pdd" }),
    ])[0];

    expect(groupQuery(group, "pdd")).toBe(
      "style=AB%2F1&size=42.5&platform=pdd",
    );
    expect(
      matchesGroup(group.units[0], {
        styleCode: "ab/1",
        productId: null,
        size: "42.5",
        platform: "pdd",
      }),
    ).toBe(true);
    expect(
      matchesGroup(group.units[0], {
        styleCode: "AB/1",
        productId: null,
        size: "42.5",
        platform: "taobao",
      }),
    ).toBe(false);
  });
});
