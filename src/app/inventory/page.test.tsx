import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { makeInventorySeed } from "@/test/inventory-fixtures";
import InventoryPage from "./page";

describe("InventoryPage", () => {
  it("shows only present purchase platforms and filters before grouping", async () => {
    render(
      <InventoryPage dataSource={new MemoryDbAdapter(makeInventorySeed())} />,
    );

    expect(await screen.findByText("×3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "全部平台" }),
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

    await userEvent.click(
      screen.getByRole("button", { name: "发往得物途中" }),
    );

    expect(await screen.findByText("×1")).toBeInTheDocument();
    expect(screen.getByText("1 件 · 1 组")).toBeInTheDocument();
    expect(screen.getAllByText("发往得物途中 1")).toHaveLength(2);
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
    const target = screen.getByLabelText("目标状态");
    expect(target).toHaveTextContent("发往得物途中");
    expect(target).not.toHaveTextContent("已结算");
    expect(target).not.toHaveTextContent("退款");
  });

  it("opens freight entry when shipping is chosen as the batch target", async () => {
    const db = new MemoryDbAdapter(makeInventorySeed());
    render(<InventoryPage dataSource={db} />);
    await screen.findByText("×3");
    await userEvent.click(screen.getByRole("button", { name: "批量操作" }));
    await userEvent.click(
      screen.getByRole("button", { name: "选择 AB-1 42，共 3 件" }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("目标状态"),
      "shipping",
    );
    await userEvent.click(screen.getByRole("button", { name: "填写运费" }));

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
      await screen.findByRole("button", {
        name: "录到手价 · 2 件待结算",
      }),
    );
    await userEvent.type(screen.getByLabelText("实际到手价"), "150");
    expect(screen.getByText("实际到账合计 ¥300.00")).toBeInTheDocument();
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

  it("keeps inventory visible and explains when a refunded unit blocks a batch action", async () => {
    const seed = makeInventorySeed();
    seed.units![0].status = "refunded";
    const db = new MemoryDbAdapter(seed);
    render(<InventoryPage dataSource={db} />);
    await screen.findByText("×3");
    await userEvent.click(screen.getByRole("button", { name: "批量操作" }));
    await userEvent.click(
      screen.getByRole("button", { name: "选择 AB-1 42，共 3 件" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "批量寄出" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "选择中包含退款件，请先按状态筛选后再寄出。",
    );
    expect(screen.getByText("×3")).toBeInTheDocument();
    expect(screen.queryByLabelText("总快递费")).not.toBeInTheDocument();
  });

  it("warns before a batch status action deletes financial records", async () => {
    const seed = makeInventorySeed();
    seed.units![0].status = "settled";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<InventoryPage dataSource={new MemoryDbAdapter(seed)} />);
    await screen.findByText("×3");
    await userEvent.click(screen.getByRole("button", { name: "批量操作" }));
    await userEvent.click(
      screen.getByRole("button", { name: "选择 AB-1 42，共 3 件" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "批量寄出" }));

    expect(confirm).toHaveBeenCalledWith(
      "重新寄出会删除所选商品已有的销售和利润记录，确认继续？",
    );
    expect(screen.queryByLabelText("总快递费")).not.toBeInTheDocument();
    confirm.mockRestore();
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
