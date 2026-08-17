import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BottomNav from "./BottomNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inventory",
}));

describe("BottomNav", () => {
  it("identifies the current page and keeps icons decorative", () => {
    const { container } = render(<BottomNav />);

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "库存" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "报表" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.queryByRole("link", { name: "设置" })).not.toBeInTheDocument();
    for (const icon of container.querySelectorAll("svg")) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });
});
