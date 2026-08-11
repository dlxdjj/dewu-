import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { makeJoinedUnit } from "@/test/inventory-fixtures";
import SaleFormSheet from "./SaleFormSheet";

describe("SaleFormSheet", () => {
  it("makes the per-item amount and batch total explicit", async () => {
    const db = new MemoryDbAdapter({
      products: [makeJoinedUnit().product],
      batches: [
        makeJoinedUnit({ id: "u1" }).batch,
        makeJoinedUnit({ id: "u2" }).batch,
      ],
      units: [
        stripJoined(makeJoinedUnit({ id: "u1", status: "sold" })),
        stripJoined(makeJoinedUnit({ id: "u2", status: "sold" })),
      ],
    });
    const units = await joinedUnits(db);
    const onDone = vi.fn();
    render(
      <SaleFormSheet
        units={units}
        dataSource={db}
        onClose={() => undefined}
        onDone={onDone}
      />,
    );

    expect(screen.getByText("每件实际到手价（元，必填）")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("实际到手价"), "123.45");
    expect(screen.getByText("2 件 × ¥123.45")).toBeInTheDocument();
    expect(screen.getByText("实际到账合计 ¥246.90")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "确认到手价并结算" }),
    );

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(db.snapshot().sales.map((sale) => sale.actual_payout_cents)).toEqual([
      12345,
      12345,
    ]);
  });

  it("prefills and updates an existing single settlement", async () => {
    const db = new MemoryDbAdapter();
    const purchase = await db.createPurchase({
      productName: "鞋",
      styleCode: "EDIT-PAYOUT",
      platform: "taobao",
      unitPriceCents: 10000,
      quantity: 1,
      purchasedAt: "2026-08-11",
      size: "42",
      initialStatus: "arrived",
      orderNo: "",
      note: "",
    });
    await db.settleUnits({
      unitIds: purchase.unitIds,
      actualPayoutCents: 15000,
      settledAt: "2026-08-10",
    });
    const units = await joinedUnits(db);
    render(
      <SaleFormSheet
        units={units}
        dataSource={db}
        onClose={() => undefined}
        onDone={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "修改实际到手价" })).toBeInTheDocument();
    expect(screen.getByLabelText("实际到手价")).toHaveValue("150.00");
    expect(screen.getByLabelText("结算日期")).toHaveValue("2026-08-10");
    await userEvent.clear(screen.getByLabelText("实际到手价"));
    await userEvent.type(screen.getByLabelText("实际到手价"), "160");
    await userEvent.click(
      screen.getByRole("button", { name: "确认修改到手价" }),
    );
    await waitFor(() =>
      expect(db.snapshot().sales[0].actual_payout_cents).toBe(16000),
    );
  });
});

function stripJoined(unit: ReturnType<typeof makeJoinedUnit>) {
  return {
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
  };
}

async function joinedUnits(db: MemoryDbAdapter) {
  const [units, products, batches, sales] = await Promise.all([
    db.listUnits(),
    db.listProducts(),
    db.listBatches(),
    db.listSales(),
  ]);
  return units.map((unit) => ({
    ...unit,
    product: products.find((product) => product.id === unit.product_id)!,
    batch: batches.find((batch) => batch.id === unit.batch_id)!,
    sale: sales.find((sale) => sale.unit_id === unit.id) ?? null,
  }));
}
