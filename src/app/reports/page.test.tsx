import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import ReportsPage from "./page";

async function settledDb(): Promise<MemoryDbAdapter> {
  const db = new MemoryDbAdapter();
  const august = await db.createPurchase({
    productName: "八月鞋",
    styleCode: "AUG-001",
    platform: "taobao",
    unitPriceCents: 8000,
    quantity: 1,
    purchasedAt: "2026-08-01",
    size: "42",
    initialStatus: "arrived",
    orderNo: "",
    note: "",
  });
  await db.settleUnits({
    unitIds: august.unitIds,
    actualPayoutCents: 12000,
    settledAt: "2026-08-03",
  });
  const july = await db.createPurchase({
    productName: "七月鞋",
    styleCode: "JUL-001",
    platform: "pdd",
    unitPriceCents: 7000,
    quantity: 1,
    purchasedAt: "2026-07-01",
    size: "41",
    initialStatus: "arrived",
    orderNo: "",
    note: "",
  });
  await db.settleUnits({
    unitIds: july.unitIds,
    actualPayoutCents: 12000,
    settledAt: "2026-07-31",
  });
  return db;
}

describe("ReportsPage", () => {
  it("shows lifetime totals and changes only the selected-month totals", async () => {
    const db = await settledDb();
    render(<ReportsPage dataSource={db} initialMonth="2026-08" />);

    const lifetime = await screen.findByRole("region", { name: "历史累计" });
    expect(within(lifetime).getByText("¥90.00")).toBeInTheDocument();
    expect(within(lifetime).getByText("¥240.00")).toBeInTheDocument();
    expect(within(lifetime).getByText("2")).toBeInTheDocument();

    let monthly = screen.getByRole("region", { name: "8月统计" });
    expect(within(monthly).getByText("¥40.00")).toBeInTheDocument();
    expect(within(monthly).getByText("¥120.00")).toBeInTheDocument();
    expect(within(monthly).getByText("1")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("月份"));
    await userEvent.type(screen.getByLabelText("月份"), "2026-07");

    monthly = screen.getByRole("region", { name: "7月统计" });
    expect(within(monthly).getByText("¥50.00")).toBeInTheDocument();
    expect(within(monthly).getByText("¥120.00")).toBeInTheDocument();
    expect(within(lifetime).getByText("¥90.00")).toBeInTheDocument();
    expect(screen.queryByText(/当前有效库存资金/)).not.toBeInTheDocument();
  });
});
