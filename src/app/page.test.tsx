import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const dataMocks = vi.hoisted(() => ({
  listUnits: vi.fn(),
  listSales: vi.fn(),
}));

const dataSource = {
  listUnits: dataMocks.listUnits,
  listSales: dataMocks.listSales,
};

describe("HomePage", () => {
  it("renders exactly the four agreed metrics for the current month", async () => {
    dataMocks.listUnits.mockResolvedValue([]);
    dataMocks.listSales.mockResolvedValue([]);

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
  });

  it("exits placeholder state and provides retry after a data error", async () => {
    dataMocks.listUnits.mockRejectedValue(new Error("读取数据库超时"));
    dataMocks.listSales.mockResolvedValue([]);

    render(
      <HomePage
        dataSource={dataSource}
        now={new Date("2026-08-04T12:00:00+02:00")}
      />,
    );

    expect(await screen.findByText("读取数据库超时")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重试加载" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });
});
