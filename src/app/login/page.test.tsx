import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/supabase/auth", () => ({
  signInWithPassword: mocks.signIn,
}));

describe("LoginPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits with Enter and exposes failures as alerts", async () => {
    const user = userEvent.setup();
    mocks.signIn.mockRejectedValueOnce(new Error("邮箱或密码错误"));
    render(<LoginPage />);

    await user.type(screen.getByLabelText("邮箱"), "owner@example.com");
    await user.type(screen.getByLabelText("密码"), "secret{Enter}");

    await waitFor(() =>
      expect(mocks.signIn).toHaveBeenCalledWith("owner@example.com", "secret"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码错误");
  });
});
