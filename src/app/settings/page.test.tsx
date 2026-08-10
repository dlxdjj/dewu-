import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue(null),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/auth", () => authMocks);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("SettingsPage", () => {
  it("uses plain-language maintenance copy and guards destructive actions", async () => {
    render(<SettingsPage />);

    expect(
      screen.getByText(
        "附件删除失败时会保留待处理任务，可稍后重试，不影响其他数据。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ACID/)).not.toBeInTheDocument();

    const clearButton = screen.getByRole("button", {
      name: "确认清空全部数据",
    });
    expect(clearButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText("清空确认词"), "清空");
    expect(clearButton).toBeEnabled();
  });
});
