import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const dataMocks = vi.hoisted(() => ({
  getHomeDashboard: vi.fn(),
}));

const dataSource = {
  getHomeDashboard: dataMocks.getHomeDashboard,
};

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMocks.getHomeDashboard.mockResolvedValue({
      inventoryCount: 0,
      inventoryCostCents: 0,
      month: "2026-08",
      monthLabel: "8月",
      monthlySalesCount: 0,
      monthlySalesCents: 0,
      monthlyShippingCents: 0,
      monthlyRebateCents: 0,
      monthlyProfitCents: 0,
      rebatesEnabled: true,
      todoCounts: {
        pending: 0,
        arrived: 0,
        shipping: 0,
        in_stock_dewu: 0,
        sold: 0,
        returned: 0,
      },
    });
  });

  it("renders exactly the four agreed metrics for the current month", async () => {
    dataMocks.getHomeDashboard.mockResolvedValue({
      ...(await dataMocks.getHomeDashboard()),
      monthlyRebateCents: 3000,
      monthlyProfitCents: 3000,
    });
    render(
      <HomePage
        dataSource={dataSource}
        now={new Date("2026-08-04T12:00:00+02:00")}
      />,
    );

    expect(await screen.findByText("库存数量")).toBeInTheDocument();
    expect(screen.getByText("库存成本")).toBeInTheDocument();
    expect(screen.getByText("8月销售额")).toBeInTheDocument();
    expect(screen.getByText("8月利润")).toBeInTheDocument();
    expect(screen.queryByText("有效库存")).not.toBeInTheDocument();
    expect(screen.queryByText("库存资金")).not.toBeInTheDocument();
    expect(screen.queryByText("未结算")).not.toBeInTheDocument();
    expect(screen.queryByText(/利润唯一口径/)).not.toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getAllByText("¥30.00")).toHaveLength(2);
    expect(screen.getByText("含返利 ¥30.00")).toBeInTheDocument();
    expect(screen.getByText("已到货").closest("a")).toHaveAttribute(
      "href",
      "/inventory?view=active&status=arrived",
    );
    expect(
      screen.getByText("本月暂无已结算销售；当前利润来自返利收入。"),
    ).toBeInTheDocument();
  });

  it("exits placeholder state and provides retry after a data error", async () => {
    dataMocks.getHomeDashboard.mockRejectedValue(new Error("读取数据库超时"));

    render(
      <HomePage
        dataSource={dataSource}
        now={new Date("2026-08-04T12:00:00+02:00")}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("读取数据库超时");
    expect(
      screen.getByRole("button", { name: "重试加载" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("does not load, display or count rebates for a bulk account", async () => {
    dataMocks.getHomeDashboard.mockResolvedValue({
      ...(await dataMocks.getHomeDashboard()),
      rebatesEnabled: false,
    });

    render(
      <HomePage
        dataSource={dataSource}
        now={new Date("2026-08-04T12:00:00+02:00")}
      />,
    );

    expect(await screen.findByText("按实际到账减进价和运费")).toBeInTheDocument();
    expect(screen.queryByText(/返利/)).not.toBeInTheDocument();
    expect(screen.getByText("本月暂无已结算销售；完成结算后将显示利润。"))
      .toBeInTheDocument();
  });
});
