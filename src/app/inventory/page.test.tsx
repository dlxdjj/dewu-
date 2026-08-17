import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { makeInventorySeed } from "@/test/inventory-fixtures";
import InventoryPage from "./page";

describe("InventoryPage", () => {
  it("shows only present purchase platforms and filters before grouping", async () => {
    render(
      <InventoryPage dataSource={new MemoryDbAdapter(makeInventorySeed())} />,
    );

    expect(await screen.findByText("×3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "筛选" }));
    expect(
      screen.getByRole("button", { name: "全部" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "淘宝" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拼多多" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "京东" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "淘宝" }));
    expect(await screen.findByText("×2")).toBeInTheDocument();
    expect(screen.queryByText("×3")).not.toBeInTheDocument();
  });

  it("filters merged inventory by an exact status", async () => {
    render(
      <InventoryPage dataSource={new MemoryDbAdapter(makeInventorySeed())} />,
    );
    await screen.findByText("×3");

    await userEvent.click(screen.getByRole("button", { name: "筛选" }));
    await userEvent.click(
      screen.getByRole("button", { name: "发往得物途中" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "查看结果" }));

    expect(await screen.findByText("×1")).toBeInTheDocument();
    expect(screen.getByText("1 件 · 1 款")).toBeInTheDocument();
    expect(screen.getByText("发往得物途中 1")).toBeInTheDocument();
  });

  it("searches by product, style, size, order or platform", async () => {
    render(
      <InventoryPage dataSource={new MemoryDbAdapter(makeInventorySeed())} />,
    );
    await screen.findByText("×3");

    await userEvent.type(screen.getByRole("searchbox", { name: "搜索库存" }), "拼多多");
    expect(await screen.findByText("×1")).toBeInTheDocument();
    expect(screen.getByText("1 件 · 1 款")).toBeInTheDocument();
  });

  it("selects every underlying unit when a merged group is selected", async () => {
    render(
      <InventoryPage dataSource={new MemoryDbAdapter(makeInventorySeed())} />,
    );
    await screen.findByText("×3");

    await userEvent.click(screen.getByRole("button", { name: "批量操作" }));
    await userEvent.click(
      screen.getByRole("button", { name: "选择 AB-1 42，共 3 件" }),
    );

    expect(screen.getByText("已选 3 件")).toBeInTheDocument();
    expect(screen.queryByLabelText("目标状态")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "处理下一步 · 3 件" }),
    );
    expect(screen.getByRole("heading", { name: "处理下一步（3 件）" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /寄往得物.*1 件/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认入仓.*1 件/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认到货.*1 件/ })).toBeInTheDocument();
  });

  it("opens freight entry directly for a batch that is ready to ship", async () => {
    const seed = makeInventorySeed();
    seed.units!.forEach((unit) => { unit.status = "arrived"; });
    const db = new MemoryDbAdapter(seed);
    render(<InventoryPage dataSource={db} />);
    await screen.findByText("×3");
    await userEvent.click(screen.getByRole("button", { name: "批量操作" }));
    await userEvent.click(
      screen.getByRole("button", { name: "选择 AB-1 42，共 3 件" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "寄往得物 · 3 件" }));

    expect(
      screen.getByRole("heading", { name: "批量寄出（3 件）" }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("总快递费"), "9");
    await userEvent.click(
      screen.getByRole("button", { name: "确认寄出并均摊" }),
    );
    await waitFor(() =>
      expect(db.snapshot().units.every((unit) => unit.status === "shipping"))
        .toBe(true),
    );
    expect(
      db
        .snapshot()
        .units.reduce(
          (sum, unit) => sum + unit.outbound_shipping_cents,
          0,
        ),
    ).toBe(900);
  });

  it("settles every sold unit in a merged group from the quick action", async () => {
    const db = new MemoryDbAdapter();
    const purchase = await db.createPurchase({
      productName: "批量鞋",
      styleCode: "SOLD-2",
      platform: "taobao",
      unitPriceCents: 10000,
      quantity: 2,
      purchasedAt: "2026-08-11",
      size: "42",
      initialStatus: "arrived",
      orderNo: "",
      note: "",
    });
    await db.changeStatus({
      unitIds: purchase.unitIds,
      toStatus: "sold",
    });
    render(<InventoryPage dataSource={db} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "待结算 2" }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "录入到手价 · 2 件",
      }),
    );
    await userEvent.type(screen.getByLabelText("实际到手价"), "150");
    expect(screen.getByText("2 件到账合计 ¥300.00")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "确认到手价并结算" }),
    );

    await waitFor(() =>
      expect(db.snapshot().units.every((unit) => unit.status === "settled"))
        .toBe(true),
    );
    expect(db.snapshot().sales.map((sale) => sale.actual_payout_cents)).toEqual([
      15000,
      15000,
    ]);
  });

  it("keeps refunded goods out of current inventory and in refund history", async () => {
    const seed = makeInventorySeed();
    seed.units![0].status = "refunded";
    const db = new MemoryDbAdapter(seed);
    render(<InventoryPage dataSource={db} />);
    expect(await screen.findByText("×2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "退货退款 1" }));
    expect(await screen.findByText("×1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批量操作" })).not.toBeInTheDocument();
  });

  it("only offers payout entry for sold selections instead of arbitrary state changes", async () => {
    const seed = makeInventorySeed();
    seed.units![0].status = "sold";
    render(<InventoryPage dataSource={new MemoryDbAdapter(seed)} />);
    await userEvent.click(await screen.findByRole("button", { name: "待结算 1" }));
    await screen.findByText("×1");
    await userEvent.click(screen.getByRole("button", { name: "批量操作" }));
    await userEvent.click(
      screen.getByRole("button", { name: "选择 AB-1 42，共 1 件" }),
    );
    expect(screen.queryByLabelText("目标状态")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "录入到手价" }));
    expect(screen.getByRole("heading", { name: "登记实际到手价" })).toBeInTheDocument();
    expect(screen.queryByLabelText("总快递费")).not.toBeInTheDocument();
  });

  it("shows the latest signed product image on the merged card", async () => {
    const seed = makeInventorySeed();
    const db = new MemoryDbAdapter({
      ...seed,
      attachments: [
        {
          id: "image-1",
          user_id: "u1",
          owner_type: "product",
          owner_id: "p1",
          kind: "product_image",
          path: "product-image",
          content_type: "image/jpeg",
          created_at: "2026-08-03T00:00:00Z",
        },
      ],
    });

    render(<InventoryPage dataSource={db} />);

    expect(await screen.findByRole("img", { name: "测试鞋" })).toHaveAttribute(
      "src",
      "memory://product-image",
    );
  });
});
