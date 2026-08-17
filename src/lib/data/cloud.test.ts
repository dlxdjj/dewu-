import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseMock } = vi.hoisted(() => ({
  getSupabaseMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: getSupabaseMock,
}));

import { createSupabaseAdapter } from "./cloud";
import type { Attachment, MonthlyRebate, Product } from "@/lib/types/database";

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

describe("Supabase void RPC responses", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a null payload when a void RPC succeeds", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    getSupabaseMock.mockReturnValue(client);
    const adapter = createSupabaseAdapter();

    await expect(
      adapter.changeStatus({ unitIds: ["unit-1"], toStatus: "shipping" }),
    ).resolves.toBeUndefined();
    await expect(
      adapter.settleUnits({
        unitIds: ["unit-1"],
        actualPayoutCents: 12000,
        settledAt: "2026-08-10",
      }),
    ).resolves.toBeUndefined();
    await expect(
      adapter.refundUnit({ unitId: "unit-1" }),
    ).resolves.toBeUndefined();

    expect(client.rpc).toHaveBeenCalledTimes(3);
  });

  it("still surfaces errors from a void RPC", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "status failed", code: "22000" },
      }),
    };
    getSupabaseMock.mockReturnValue(client);

    await expect(
      createSupabaseAdapter().changeStatus({
        unitIds: ["unit-1"],
        toStatus: "shipping",
      }),
    ).rejects.toThrow("status failed");
  });
});

describe("Supabase monthly rebates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("saves both sources through one atomic RPC", async () => {
    const rows: MonthlyRebate[] = [
      {
        id: "rebate-1",
        user_id: "user-1",
        month: "2026-08-01",
        source: "taobao_alliance",
        amount_cents: 1000,
        created_at: "2026-08-10T00:00:00Z",
        updated_at: "2026-08-10T00:00:00Z",
      },
      {
        id: "rebate-2",
        user_id: "user-1",
        month: "2026-08-01",
        source: "jingfen",
        amount_cents: 2000,
        created_at: "2026-08-10T00:00:00Z",
        updated_at: "2026-08-10T00:00:00Z",
      },
    ];
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    getSupabaseMock.mockReturnValue(client);

    await expect(
      createSupabaseAdapter().saveMonthlyRebates({
        month: "2026-08-01",
        taobaoAllianceCents: 1000,
        jingfenCents: 2000,
      }),
    ).resolves.toEqual(rows);
    expect(client.rpc).toHaveBeenCalledWith("save_monthly_rebates", {
      p_month: "2026-08-01",
      p_taobao_alliance_cents: 1000,
      p_jingfen_cents: 2000,
    });
  });

  it("keeps pages readable before migration 0005 is applied", async () => {
    const query = {
      select: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.order.mockResolvedValue({
      data: null,
      error: { message: "relation does not exist", code: "42P01" },
    });
    const client = {
      from: vi.fn().mockReturnValue(query),
    };
    getSupabaseMock.mockReturnValue(client);

    await expect(createSupabaseAdapter().listRebates()).resolves.toEqual([]);
  });
});

describe("Supabase account cache isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the current user namespace after switching accounts", async () => {
    const suffix = crypto.randomUUID();
    let currentUserId = `owner-${suffix}`;
    const productForCurrentUser = (): Product => ({
      id: `product-${currentUserId}`,
      user_id: currentUserId,
      name: currentUserId.startsWith("owner-") ? "我的商品" : "朋友的商品",
      style_code: "SWITCH-001",
      brand: null,
      created_at: "2026-08-17T00:00:00Z",
      updated_at: "2026-08-17T00:00:00Z",
    });
    const query = {
      select: vi.fn(),
      order: vi.fn(() => Promise.resolve({
        data: [productForCurrentUser()],
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    const client = {
      auth: {
        getSession: vi.fn(() => Promise.resolve({
          data: { session: { user: { id: currentUserId } } },
          error: null,
        })),
      },
      from: vi.fn().mockReturnValue(query),
    };
    getSupabaseMock.mockReturnValue(client);
    const adapter = createSupabaseAdapter();

    await expect(adapter.listProducts()).resolves.toEqual([
      expect.objectContaining({ user_id: `owner-${suffix}`, name: "我的商品" }),
    ]);

    currentUserId = `friend-${suffix}`;
    await expect(adapter.listProducts()).resolves.toEqual([
      expect.objectContaining({ user_id: `friend-${suffix}`, name: "朋友的商品" }),
    ]);
    expect(client.auth.getSession).toHaveBeenCalledTimes(2);
  });
});
