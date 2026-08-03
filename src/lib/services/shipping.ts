import type { DbAdapter, ShippingAllocation, ShipUnitsInput, ShipUnitsResult } from "@/lib/data/types";
import type { InventoryUnit } from "@/lib/types/database";
import { assertCents, parseYuanToCents } from "@/lib/utils/money";

export interface ShippingCandidate { id: string; createdAt: string; currentShippingCents: number; }
export interface ShippingPreview { allocations: ShippingAllocation[]; totalShippingCents: number; hasOverwrite: boolean; }

export function allocateShippingCents(candidates: ShippingCandidate[], totalShippingCents: number): ShippingAllocation[] {
  assertCents(totalShippingCents, "总快递费");
  if (candidates.length < 1) throw new Error("至少选择一件商品");
  const ids = new Set(candidates.map((candidate) => candidate.id));
  if (ids.size !== candidates.length) throw new Error("商品 ID 不得重复");
  const ordered = [...candidates].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const quotient = Math.floor(totalShippingCents / ordered.length);
  const remainder = totalShippingCents % ordered.length;
  const allocations = ordered.map((candidate, index) => ({ unitId: candidate.id, shippingCents: quotient + (index < remainder ? 1 : 0) }));
  const sum = allocations.reduce((total, item) => total + item.shippingCents, 0);
  const amounts = allocations.map((item) => item.shippingCents);
  if (sum !== totalShippingCents || Math.max(...amounts) - Math.min(...amounts) > 1) throw new Error("快递费均摊校验失败");
  return allocations;
}

export function previewShipping(units: Pick<InventoryUnit, "id" | "created_at" | "outbound_shipping_cents">[], totalYuan: string): ShippingPreview {
  const totalShippingCents = parseYuanToCents(totalYuan);
  const candidates = units.map((unit) => ({ id: unit.id, createdAt: unit.created_at, currentShippingCents: unit.outbound_shipping_cents }));
  return { allocations: allocateShippingCents(candidates, totalShippingCents), totalShippingCents, hasOverwrite: candidates.some((item) => item.currentShippingCents > 0) };
}

export async function shipUnits(db: DbAdapter, input: ShipUnitsInput): Promise<ShipUnitsResult> { return db.shipUnits(input); }
