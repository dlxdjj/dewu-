import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const dataMocks = vi.hoisted(() => ({
  listUnits: vi.fn(),
  listSales: vi.fn(),
  listRebates: vi.fn(),
}));

const dataSource = {
  listUnits: dataMocks.listUnits,
  listSales: dataMocks.listSales,
  listRebates: dataMocks.listRebates,
};

describe("HomePage", () => {
  it("renders exactly the four agreed metrics for the current month", async () => {
    dataMocks.listUnits.mockResolvedValue([]);
    dataMocks.listSales.mockResolvedValue([]);
    dataMocks.listRebates.mockResolvedValue([
      {
        id: "r1",
        user_id: "u1",
        month: "2026-08-01",
        source: "taobao_alliance",
        amount_cents: 3000,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ]);

    render(
      <HomePage
        dataSource={dataSource}
        now={new Date("2026-08-04T12:00:00+02:00")}
      />,
    );

    expect(await screen.findByText("库存数量")).toBeInTheDocument();
    expect(screen.getByText("库存成本")).toBeInTheDocument();
    expect(screen.getByText("8月销量")).toBeInTheDocument();
    expect(screen.getByText("8月利润")).toBeInTheDocument();
    expect(screen.queryByText("有效库存")).not.toBeInTheDocument();
    expect(screen.queryByText("库存资金")).not.toBeInTheDocument();
    expect(screen.queryByText("未结算")).not.toBeInTheDocument();
    expect(screen.queryByText(/利润唯一口径/)).not.toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByText("¥30.00")).toBeInTheDocument();
    expect(screen.getByText("含返利 ¥30.00")).toBeInTheDocument();
    expect(
      screen.getByText("本月暂无已结算销售；当前利润来自返利收入。"),
    ).toBeInTheDocument();
  });

  it("exits placeholder state and provides retry after a data error", async () => {
    dataMocks.listUnits.mockRejectedValue(new Error("读取数据库超时"));
    dataMocks.listSales.mockResolvedValue([]);
    dataMocks.listRebates.mockResolvedValue([]);

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
});
