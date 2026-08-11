import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it("downloads the selected-month report as a CSV file", async () => {
    const db = await settledDb();
    const createObjectUrl = vi.fn<(blob: Blob) => string>(() => "blob:report");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const clickAnchor = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<ReportsPage dataSource={db} initialMonth="2026-08" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "导出 CSV" }),
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0][0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(clickAnchor).toHaveBeenCalledTimes(1);
    const clickedAnchor = clickAnchor.mock.contexts[0] as
      | HTMLAnchorElement
      | undefined;
    expect(clickedAnchor?.download).toBe("报表-2026-08.csv");
    expect(clickedAnchor?.href).toBe("blob:report");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:report");
  });

  it("explains an empty selected month", async () => {
    render(
      <ReportsPage
        dataSource={new MemoryDbAdapter()}
        initialMonth="2026-08"
      />,
    );

    expect(
      await screen.findByText(
        "本月暂无已结算记录；完成结算或录入返利后将显示利润。",
      ),
    ).toBeInTheDocument();
  });

  it("saves both rebate sources and adds them only to profit", async () => {
    const db = await settledDb();
    render(<ReportsPage dataSource={db} initialMonth="2026-08" />);

    await screen.findByRole("region", { name: "8月统计" });
    await userEvent.clear(screen.getByLabelText("淘宝联盟返利"));
    await userEvent.type(screen.getByLabelText("淘宝联盟返利"), "10");
    await userEvent.clear(screen.getByLabelText("京粉返利"));
    await userEvent.type(screen.getByLabelText("京粉返利"), "20");
    await userEvent.click(
      screen.getByRole("button", { name: "保存本月返利" }),
    );

    expect(
      await screen.findByText("本月返利已保存并计入利润。"),
    ).toBeInTheDocument();
    const lifetime = screen.getByRole("region", { name: "历史累计" });
    expect(within(lifetime).getByText("¥120.00")).toBeInTheDocument();
    expect(within(lifetime).getByText("¥240.00")).toBeInTheDocument();
    expect(within(lifetime).getByText("2")).toBeInTheDocument();
    const monthly = screen.getByRole("region", { name: "8月统计" });
    expect(within(monthly).getByText("¥70.00")).toBeInTheDocument();
    expect(within(monthly).getByText("¥120.00")).toBeInTheDocument();
    expect(within(monthly).getByText("1")).toBeInTheDocument();
    expect(db.snapshot().rebates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          month: "2026-08-01",
          source: "taobao_alliance",
          amount_cents: 1000,
        }),
        expect.objectContaining({
          month: "2026-08-01",
          source: "jingfen",
          amount_cents: 2000,
        }),
      ]),
    );
  });
});
