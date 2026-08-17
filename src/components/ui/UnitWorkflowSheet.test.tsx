import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { makeJoinedUnit } from "@/test/inventory-fixtures";
import UnitWorkflowSheet from "./UnitWorkflowSheet";

describe("UnitWorkflowSheet", () => {
  it("advances a pending unit through its only normal next action", async () => {
    const joined = makeJoinedUnit({ id: "p1", status: "pending" });
    const db = databaseFor([joined]);
    const onDone = vi.fn();
    render(
      <UnitWorkflowSheet
        units={[joined]}
        dataSource={db}
        onClose={() => undefined}
        onDone={onDone}
      />,
    );

    expect(screen.queryByLabelText("目标状态")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "确认已经到货" }));
    await waitFor(() => expect(db.snapshot().units[0].status).toBe("arrived"));
    expect(onDone).toHaveBeenCalledWith("确认到货 1 件");
  });

  it("separates mixed selections by current status", async () => {
    const arrived = makeJoinedUnit({ id: "a1", status: "arrived" });
    const shipping = makeJoinedUnit({ id: "s1", status: "shipping" });
    render(
      <UnitWorkflowSheet
        units={[arrived, shipping]}
        dataSource={databaseFor([arrived, shipping])}
        onClose={() => undefined}
        onDone={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "处理下一步（2 件）" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /寄往得物.*1 件/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认入仓.*1 件/ })).toBeInTheDocument();
  });

  it("opens sale registration directly for stock at the Dewu warehouse", () => {
    const joined = makeJoinedUnit({ id: "stock-1", status: "in_stock_dewu" });
    render(
      <UnitWorkflowSheet
        units={[joined]}
        dataSource={databaseFor([joined])}
        onClose={() => undefined}
        onDone={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "登记售出" })).toBeInTheDocument();
    expect(screen.getByLabelText("实际到手价")).not.toBeRequired();
    expect(screen.getByRole("button", { name: "标记已售，稍后结算" })).toBeInTheDocument();
  });
});

function databaseFor(units: ReturnType<typeof makeJoinedUnit>[]) {
  return new MemoryDbAdapter({
    products: [...new Map(units.map((unit) => [unit.product.id, unit.product])).values()],
    batches: units.map((unit) => unit.batch),
    units: units.map((unit) => ({
      id: unit.id,
      user_id: unit.user_id,
      batch_id: unit.batch_id,
      product_id: unit.product_id,
      size: unit.size,
      unit_cost_cents: unit.unit_cost_cents,
      listing_price_cents: unit.listing_price_cents,
      outbound_shipping_cents: unit.outbound_shipping_cents,
      status: unit.status,
      created_at: unit.created_at,
      updated_at: unit.updated_at,
    })),
  });
}
