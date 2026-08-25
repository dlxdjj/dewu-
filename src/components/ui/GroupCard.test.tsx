import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeJoinedUnit } from "@/test/inventory-fixtures";
import { buildGroups } from "@/lib/utils/group";
import GroupCard from "./GroupCard";

const group = buildGroups([
  makeJoinedUnit({
    id: "u1",
    styleCode: "AB-1",
    platform: "taobao",
    cost: 100,
    status: "arrived",
  }),
  makeJoinedUnit({
    id: "u2",
    styleCode: "ab-1",
    platform: "pdd",
    cost: 200,
    status: "shipping",
  }),
])[0];

describe("GroupCard", () => {
  it("shows the merged quantity cost platforms and status distribution", () => {
    render(
      <GroupCard
        group={group}
        imageUrl="https://signed.example/image"
        platformFilter="all"
        selectable={false}
        selected={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("数量 2")).toHaveClass("inventory-quantity-badge");
    expect(screen.getByText("成本合计 ¥3.00")).toBeInTheDocument();
    expect(screen.getByText("淘宝 · 拼多多")).toBeInTheDocument();
    expect(screen.getByText("已到货 1")).toBeInTheDocument();
    expect(screen.getByText("发往得物途中 1")).toBeInTheDocument();
    expect(screen.getByLabelText("库存状态")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveClass(
      "min-w-0",
      "max-w-full",
      "overflow-hidden",
    );
    expect(screen.getByText("AB-1 · 42")).toHaveClass("text-sm");
    expect(screen.getByText("已到货 1")).toHaveClass("text-sm");
    expect(screen.getByText("成本合计 ¥3.00")).toHaveClass("text-sm");
    expect(screen.getByRole("img", { name: "测试鞋" })).toHaveAttribute(
      "src",
      "https://signed.example/image",
    );
    expect(screen.getByRole("img", { name: "测试鞋" })).toHaveAttribute(
      "loading",
      "lazy",
    );
    expect(screen.getByRole("img", { name: "测试鞋" })).toHaveAttribute(
      "decoding",
      "async",
    );
  });

  it("prioritizes an above-the-fold product image", () => {
    render(
      <GroupCard
        group={group}
        imageUrl="https://signed.example/priority"
        imagePriority
        platformFilter="all"
        selectable={false}
        selected={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "测试鞋" })).toHaveAttribute(
      "loading",
      "eager",
    );
    expect(screen.getByRole("img", { name: "测试鞋" })).toHaveAttribute(
      "fetchpriority",
      "high",
    );
  });

  it("shows a realized group profit only when it is provided", () => {
    const { rerender } = render(
      <GroupCard
        group={group}
        imageUrl={null}
        profitCents={4666}
        platformFilter="all"
        selectable={false}
        selected={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("利润合计")).toBeInTheDocument();
    expect(screen.getByText("+¥46.66")).toHaveStyle({ color: "#1B7F37" });

    rerender(
      <GroupCard
        group={group}
        imageUrl={null}
        platformFilter="all"
        selectable={false}
        selected={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText("利润合计")).not.toBeInTheDocument();
  });

  it("retries a failed remote image before falling back to the box icon", () => {
    render(
      <GroupCard
        group={group}
        imageUrl="https://signed.example/image?token=test"
        platformFilter="all"
        selectable={false}
        selected={false}
        onToggle={vi.fn()}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "测试鞋" }));
    expect(screen.getByRole("img", { name: "测试鞋" })).toHaveAttribute(
      "src",
      expect.stringContaining("retry=1"),
    );
    fireEvent.error(screen.getByRole("img", { name: "测试鞋" }));
    fireEvent.error(screen.getByRole("img", { name: "测试鞋" }));
    expect(screen.queryByRole("img", { name: "测试鞋" })).not.toBeInTheDocument();
  });

  it("selects the whole group instead of navigating in batch mode", async () => {
    const onToggle = vi.fn();
    render(
      <GroupCard
        group={group}
        imageUrl={null}
        platformFilter="all"
        selectable
        selected={false}
        onToggle={onToggle}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "选择 AB-1 42，共 2 件" }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers one-tap settlement for every sold unit in the group", async () => {
    const soldGroup = buildGroups([
      makeJoinedUnit({ id: "s1", status: "sold" }),
      makeJoinedUnit({ id: "s2", status: "sold" }),
    ])[0];
    const onProcess = vi.fn();
    render(
      <GroupCard
        group={soldGroup}
        imageUrl={null}
        platformFilter="all"
        selectable={false}
        selected={false}
        onToggle={vi.fn()}
        onProcess={onProcess}
      />,
    );

    const action = screen.getByRole("button", { name: "录入到手价 · 2 件" });
    expect(action).toHaveClass("inventory-action-button", "min-h-[52px]");
    await userEvent.click(action);
    expect(onProcess).toHaveBeenCalledWith(soldGroup.units);
  });
});
