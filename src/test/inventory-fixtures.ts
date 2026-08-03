import type { Platform } from "@/lib/constants/platform";
import type { UnitStatus } from "@/lib/constants/status";
import type { MemoryState } from "@/lib/data/memory";
import type { InventoryUnit, UnitJoined } from "@/lib/types/database";

const timestamp = "2026-08-01T00:00:00Z";

export function makeJoinedUnit(
  overrides: {
    id?: string;
    productId?: string;
    styleCode?: string | null;
    size?: string;
    platform?: Platform;
    cost?: number;
    status?: UnitStatus;
  } = {},
): UnitJoined {
  const id = overrides.id ?? "u1";
  const productId = overrides.productId ?? "p1";
  const cost = overrides.cost ?? 10000;
  return {
    id,
    user_id: "u1",
    product_id: productId,
    batch_id: `b-${id}`,
    size: overrides.size ?? "42",
    unit_cost_cents: cost,
    listing_price_cents: null,
    outbound_shipping_cents: 0,
    status: overrides.status ?? "arrived",
    created_at: timestamp,
    updated_at: timestamp,
    product: {
      id: productId,
      user_id: "u1",
      name: "测试鞋",
      style_code:
        overrides.styleCode === undefined ? "AB-1" : overrides.styleCode,
      brand: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    batch: {
      id: `b-${id}`,
      user_id: "u1",
      product_id: productId,
      platform: overrides.platform ?? "taobao",
      order_no: null,
      unit_price_cents: cost,
      quantity: 1,
      shipping_fee_cents: 0,
      discount_amount_cents: 0,
      purchased_at: "2026-08-01",
      note: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    sale: null,
  };
}

function inventoryRow(unit: UnitJoined): InventoryUnit {
  return {
    id: unit.id,
    user_id: unit.user_id,
    product_id: unit.product_id,
    batch_id: unit.batch_id,
    size: unit.size,
    unit_cost_cents: unit.unit_cost_cents,
    listing_price_cents: unit.listing_price_cents,
    outbound_shipping_cents: unit.outbound_shipping_cents,
    status: unit.status,
    created_at: unit.created_at,
    updated_at: unit.updated_at,
  };
}

export function makeInventorySeed(): Partial<MemoryState> {
  const joined = [
    makeJoinedUnit({
      id: "u1",
      productId: "p1",
      styleCode: "AB-1",
      platform: "taobao",
      cost: 10000,
      status: "arrived",
    }),
    makeJoinedUnit({
      id: "u2",
      productId: "p1",
      styleCode: "AB-1",
      platform: "taobao",
      cost: 11000,
      status: "shipping",
    }),
    makeJoinedUnit({
      id: "u3",
      productId: "p1",
      styleCode: "AB-1",
      platform: "pdd",
      cost: 12000,
      status: "pending",
    }),
  ];
  return {
    products: [joined[0].product],
    batches: joined.map((unit) => unit.batch),
    units: joined.map(inventoryRow),
  };
}
