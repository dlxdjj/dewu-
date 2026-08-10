import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseMock } = vi.hoisted(() => ({
  getSupabaseMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: getSupabaseMock,
}));

import { createSupabaseAdapter } from "./cloud";
import type { Attachment } from "@/lib/types/database";

function createClient(lookupRows: Attachment[]) {
  const upload = vi.fn().mockResolvedValue({ data: { path: "uploaded" }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: lookupRows, error: null });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    storage: {
      from: vi.fn().mockReturnValue({ upload, remove }),
    },
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { message: "metadata failed", code: "22000" },
    }),
  };
  return { client, remove };
}

describe("Supabase attachment reconciliation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("removes an uploaded object when metadata definitively did not commit", async () => {
    const { client, remove } = createClient([]);
    getSupabaseMock.mockReturnValue(client);

    await expect(
      createSupabaseAdapter().saveAttachment({
        file: new Blob(["image"], { type: "image/jpeg" }),
        owner_type: "product",
        owner_id: "product-1",
        kind: "product_image",
      }),
    ).rejects.toThrow("metadata failed");

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0][0]).toMatch(
      /^user-1\/product\/product-1\//,
    );
  });

  it("returns committed metadata after an ambiguous RPC response", async () => {
    const committed: Attachment = {
      id: "attachment-1",
      user_id: "user-1",
      owner_type: "product",
      owner_id: "product-1",
      kind: "product_image",
      path: "user-1/product/product-1/object-1",
      content_type: "image/jpeg",
      created_at: "2026-08-10T00:00:00Z",
    };
    const { client, remove } = createClient([committed]);
    getSupabaseMock.mockReturnValue(client);

    await expect(
      createSupabaseAdapter().saveAttachment({
        file: new Blob(["image"], { type: "image/jpeg" }),
        owner_type: "product",
        owner_id: "product-1",
        kind: "product_image",
      }),
    ).resolves.toEqual(committed);
    expect(remove).not.toHaveBeenCalled();
  });
});
