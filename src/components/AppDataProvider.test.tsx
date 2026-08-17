import { act, render, screen } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  onAuthSessionChange: vi.fn(),
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/lib/data", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/supabase/auth", () => ({
  onAuthSessionChange: mocks.onAuthSessionChange,
}));

import AppDataProvider, { useAppData } from "./AppDataProvider";

function Probe() {
  const shared = useAppData();
  return <p>{shared?.data?.preferences.user_id ?? "无账户数据"}</p>;
}

describe("AppDataProvider account switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/";
  });

  it("clears the previous snapshot and loads the newly signed-in account", async () => {
    let userId = "owner";
    let workflow: "standard" | "bulk" = "standard";
    let authCallback:
      | ((event: AuthChangeEvent, session: Session | null) => void)
      | undefined;
    const db = {
      getAccountPreferences: vi.fn(() => Promise.resolve({
        user_id: userId,
        workflow,
        updated_at: "2026-08-17T00:00:00Z",
      })),
      listUnits: vi.fn(() => Promise.resolve([])),
      listProducts: vi.fn(() => Promise.resolve([])),
      listBatches: vi.fn(() => Promise.resolve([])),
      listSales: vi.fn(() => Promise.resolve([])),
      listRebates: vi.fn(() => Promise.resolve([])),
      listShippingEvents: vi.fn(() => Promise.resolve([])),
      listShippingEventItems: vi.fn(() => Promise.resolve([])),
    };
    mocks.getDb.mockReturnValue(db);
    mocks.onAuthSessionChange.mockImplementation((callback) => {
      authCallback = callback;
      return vi.fn();
    });

    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    expect(await screen.findByText("owner")).toBeInTheDocument();

    act(() => authCallback?.("SIGNED_OUT", null));
    expect(screen.getByText("无账户数据")).toBeInTheDocument();

    userId = "friend";
    workflow = "bulk";
    act(() => authCallback?.("SIGNED_IN", {
      user: { id: "friend" },
    } as Session));

    expect(await screen.findByText("friend")).toBeInTheDocument();
    expect(db.listRebates).toHaveBeenCalledTimes(1);
  });
});
