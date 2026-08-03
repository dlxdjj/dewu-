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

describe("HomePage initial data load", () => {
  it("renders a logged-in empty database as zero values", async () => {
    dataMocks.listUnits.mockResolvedValue([]);
    dataMocks.listSales.mockResolvedValue([]);

    render(<HomePage dataSource={dataSource} />);

    expect(await screen.findAllByText("0", { selector: "p" })).toHaveLength(2);
    expect(screen.getAllByText("¥0.00")).toHaveLength(2);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("exits placeholder state and provides retry after a data error", async () => {
    dataMocks.listUnits.mockRejectedValue(new Error("读取数据库超时"));
    dataMocks.listSales.mockResolvedValue([]);

    render(<HomePage dataSource={dataSource} />);

    expect(await screen.findByText("读取数据库超时")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重试加载" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });
});
