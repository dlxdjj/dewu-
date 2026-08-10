import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { makeInventorySeed } from "@/test/inventory-fixtures";
import InventoryGroupPage from "./page";

describe("InventoryGroupPage", () => {
  it("lists platform cost and status for every unit in the merged group", async () => {
    render(
      <InventoryGroupPage
        dataSource={new MemoryDbAdapter(makeInventorySeed())}
        initialQuery={{
          styleCode: "AB-1",
          productId: null,
          size: "42",
          platform: null,
        }}
      />,
    );

    expect(await screen.findByText("数量 3 件")).toBeInTheDocument();
    expect(screen.getByText("采购成本合计 ¥330.00")).toBeInTheDocument();
    expect(screen.getByText("淘宝 · ¥100.00 · 已到货")).toBeInTheDocument();
    expect(
      screen.getByText("淘宝 · ¥110.00 · 发往得物途中"),
    ).toBeInTheDocument();
    expect(screen.getByText("拼多多 · ¥120.00 · 未到货")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "查看单件" })).toHaveLength(3);
  });

  it("honors the optional platform scope in a group link", async () => {
    render(
      <InventoryGroupPage
        dataSource={new MemoryDbAdapter(makeInventorySeed())}
        initialQuery={{
          styleCode: "AB-1",
          productId: null,
          size: "42",
          platform: "pdd",
        }}
      />,
    );

    expect(await screen.findByText("数量 1 件")).toBeInTheDocument();
    expect(screen.getByText("拼多多 · ¥120.00 · 未到货")).toBeInTheDocument();
    expect(screen.queryByText("淘宝 · ¥100.00 · 已到货")).not.toBeInTheDocument();
  });
});
