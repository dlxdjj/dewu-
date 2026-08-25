import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { makeInventorySeed } from "@/test/inventory-fixtures";
import InventoryGroupPage from "./page";

describe("InventoryGroupPage", () => {
  it("lists platform cost and status for every unit in the merged group", async () => {
    render(
      <InventoryGroupPage
        dataSource={new MemoryDbAdapter(makeInventorySeed())}
        returnHref="/inventory?view=sales&sort=profit_desc"
        initialQuery={{
          styleCode: "AB-1",
          productId: null,
          size: "42",
          platform: null,
        }}
      />,
    );

    expect(await screen.findByText("数量 3 件")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "‹ 销售记录" })).toHaveAttribute(
      "href",
      "/inventory?view=sales&sort=profit_desc",
    );
    expect(screen.getByText("采购成本合计 ¥330.00")).toBeInTheDocument();
    expect(
      screen.getByText("第 1 件 · 淘宝 · 进价 ¥100.00"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("第 2 件 · 淘宝 · 进价 ¥110.00"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("第 3 件 · 拼多多 · 进价 ¥120.00"),
    ).toBeInTheDocument();
    expect(screen.getByText("发往得物途中 · 寄出运费 ¥0.00")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "详情与更多" })).toHaveLength(3);
    expect(
      decodeURIComponent(
        screen.getAllByRole("link", { name: "详情与更多" })[0]
          .getAttribute("href") ?? "",
      ),
    ).toContain("returnTo=/inventory/group?");
    expect(screen.getByRole("button", { name: "寄往得物" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认入仓" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认到货" })).toBeInTheDocument();
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
    expect(
      screen.getByText("第 1 件 · 拼多多 · 进价 ¥120.00"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("第 1 件 · 淘宝 · 进价 ¥100.00"),
    ).not.toBeInTheDocument();
  });

  it("settles all sold units in the same group without opening each detail", async () => {
    const db = new MemoryDbAdapter();
    const purchase = await db.createPurchase({
      productName: "同款鞋",
      styleCode: "GROUP-SOLD",
      platform: "taobao",
      unitPriceCents: 9000,
      quantity: 2,
      purchasedAt: "2026-08-11",
      size: "41",
      initialStatus: "arrived",
      orderNo: "",
      note: "",
    });
    await db.changeStatus({ unitIds: purchase.unitIds, toStatus: "sold" });
    render(
      <InventoryGroupPage
        dataSource={db}
        initialQuery={{
          styleCode: "GROUP-SOLD",
          productId: null,
          size: "41",
          platform: null,
        }}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", {
        name: "录入到手价 · 2 件",
      }),
    );
    expect(screen.getAllByRole("button", { name: "录入到手价" })).toHaveLength(
      2,
    );
    await userEvent.type(screen.getByLabelText("实际到手价"), "130");
    await userEvent.click(
      screen.getByRole("button", { name: "确认到手价并结算" }),
    );

    await waitFor(() =>
      expect(db.snapshot().units.every((unit) => unit.status === "settled"))
        .toBe(true),
    );
    expect(await screen.findAllByText("修改到手价")).toHaveLength(2);
    expect(screen.getByText("实际利润合计")).toBeInTheDocument();
    expect(screen.getByText("+¥80.00")).toBeInTheDocument();
    expect(screen.getAllByText("+¥40.00")).toHaveLength(2);
  });

  it("fills a missing size for every imported unit without recreating stock", async () => {
    const db = new MemoryDbAdapter({
      preferences: {
        user_id: "test-user",
        workflow: "bulk",
        updated_at: "2026-08-17T00:00:00Z",
      },
    });
    await db.createPurchase({
      productName: "待补尺码商品",
      styleCode: "SIZE-LATER",
      platform: "other",
      unitPriceCents: 10000,
      quantity: 3,
      purchasedAt: "2026-08-17",
      size: "",
      initialStatus: "arrived",
      orderNo: "",
      note: "",
    });
    render(
      <InventoryGroupPage
        dataSource={db}
        initialQuery={{
          styleCode: "SIZE-LATER",
          productId: null,
          size: "",
          platform: null,
        }}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "补充尺码 · 3 件" }),
    );
    await userEvent.type(screen.getByLabelText("第 1 组尺码"), "42");
    await userEvent.click(screen.getByRole("button", { name: "确认保存尺码" }));

    await waitFor(() =>
      expect(db.snapshot().units.map((unit) => unit.size)).toEqual(["42", "42", "42"]),
    );
    expect(db.snapshot().units).toHaveLength(3);
  });
});
