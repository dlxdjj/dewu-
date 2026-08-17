import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InventoryUnit } from "@/lib/types/database";
import { todayStr } from "@/lib/utils/format";
import BatchShippingSheet from "./BatchShippingSheet";

const unit = (id: string): InventoryUnit => ({
  id,
  user_id: "u1",
  batch_id: "b1",
  product_id: "p1",
  size: "42",
  unit_cost_cents: 10000,
  listing_price_cents: null,
  outbound_shipping_cents: 0,
  status: "arrived",
  created_at: `2026-08-10T00:00:0${id}Z`,
  updated_at: "2026-08-10T00:00:00Z",
});

describe("BatchShippingSheet", () => {
  it("previews an exact batch allocation and confirms", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <BatchShippingSheet
        units={[unit("1"), unit("2"), unit("3")]}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    await userEvent.type(screen.getByLabelText("总快递费"), "10.00");
    expect(screen.getByText("分摊合计：¥10.00")).toBeInTheDocument();
    await userEvent.click(screen.getByText("确认寄出并均摊"));
    expect(onConfirm).toHaveBeenCalledWith(1000, "append", todayStr());
  });

  it("requires freight for a single shipment", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <BatchShippingSheet
        units={[unit("1")]}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "寄出并录入运费" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "确认运费并寄出" }),
    ).toBeDisabled();
    await userEvent.type(screen.getByLabelText("寄出快递费"), "8.50");
    expect(screen.getByText("本件运费：¥8.50")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "确认运费并寄出" }),
    );
    expect(onConfirm).toHaveBeenCalledWith(850, "append", todayStr());
  });
});
