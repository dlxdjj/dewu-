import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn().mockResolvedValue({ error: null }),
  getUser: vi.fn().mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ insert: mocks.insert }),
  }),
}));

import { monitoredRequest, recordClientEvent } from "./monitoring";

describe("client monitoring", () => {
  it("records sanitized authenticated errors without blocking the caller", async () => {
    recordClientEvent("error", "owner@example.com token=secret failed");
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    expect(mocks.insert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        user_id: "user-1",
        kind: "error",
        message: "[email] token=[redacted] failed",
      }),
    );
  });

  it("preserves request failures after monitoring them", async () => {
    await expect(
      monitoredRequest("test-request", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });
});
