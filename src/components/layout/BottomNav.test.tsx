import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BottomNav from "./BottomNav";

const mocks = vi.hoisted(() => ({ pathname: "/settings" }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

describe("BottomNav", () => {
  beforeEach(() => {
    mocks.pathname = "/settings";
  });
  it("identifies the current page and keeps icons decorative", () => {
    const { container } = render(<BottomNav />);

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "设置" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "报表" })).not.toHaveAttribute(
      "aria-current",
    );
    for (const icon of container.querySelectorAll("svg")) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("stays hidden on the unauthenticated login route", () => {
    mocks.pathname = "/login";
    render(<BottomNav />);
    expect(screen.queryByRole("navigation", { name: "主导航" })).not.toBeInTheDocument();
  });
});
