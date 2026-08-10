import type { InventoryUnit, Sale } from "@/lib/types/database";
import { assertCents } from "@/lib/utils/money";

export interface ProfitResult { kind: "actual" | "none"; value: number | null; }

/** The only accepted profit formula. Null payout means unsettled. */
export function actualProfitCents(unitCostCents: number, outboundShippingCents: number, actualPayoutCents: number | null): number | null {
  assertCents(unitCostCents, "进价");
  assertCents(outboundShippingCents, "寄出快递费");
  if (actualPayoutCents == null) return null;
  assertCents(actualPayoutCents, "到手价");
  const result = actualPayoutCents - unitCostCents - outboundShippingCents;
  if (!Number.isSafeInteger(result)) throw new RangeError("利润超出安全整数范围");
  return result;
}

export function unitProfit(unit: Pick<InventoryUnit, "status" | "unit_cost_cents" | "outbound_shipping_cents">, sale?: Pick<Sale, "actual_payout_cents"> | null): ProfitResult {
  if (unit.status === "refunded") return { kind: "none", value: null };
  const value = actualProfitCents(unit.unit_cost_cents, unit.outbound_shipping_cents, sale?.actual_payout_cents ?? null);
  return { kind: value == null ? "none" : "actual", value };
}

export function profitColor(value: number | null | undefined): string { return value == null || value === 0 ? "#636366" : value > 0 ? "#1B7F37" : "#D70015"; }
export function profitMargin(profitCents: number, unitCostCents: number): number | null { return unitCostCents > 0 ? profitCents / unitCostCents : null; }
export function daysInStatus(unit: Pick<InventoryUnit, "created_at">, lastChangeAt: string | null, now = new Date()): number { return Math.max(0, Math.floor((now.getTime() - new Date(lastChangeAt ?? unit.created_at).getTime()) / 86_400_000)); }
export function daysSinceCreated(unit: Pick<InventoryUnit, "created_at">, now = new Date()): number { return daysInStatus(unit, null, now); }
