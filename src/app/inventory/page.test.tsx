import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "淘宝" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拼多多" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "京东" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "淘宝" }));
    expect(await screen.findByText("×2")).toBeInTheDocument();
    expect(screen.queryByText("×3")).not.toBeInTheDocument();
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
    expect(target).not.toHaveTextContent("发往得物途中");
    expect(target).not.toHaveTextContent("已结算");
    expect(target).not.toHaveTextContent("退款");
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
