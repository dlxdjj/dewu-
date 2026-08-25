import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import Sheet from "./Sheet";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <main className="app-main">
        <button type="button" onClick={() => setOpen(true)}>打开结算</button>
      </main>
      <nav aria-label="主导航" />
      <Sheet open={open} title="登记实际到手价" onClose={() => setOpen(false)}>
        <label>金额<input aria-label="金额" /></label>
        <button type="button">确认</button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("exposes dialog semantics, traps the background, and restores focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "打开结算" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "登记实际到手价" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.querySelector(".app-main")).toHaveAttribute("inert");
    expect(screen.getByRole("navigation", { name: "主导航" })).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
