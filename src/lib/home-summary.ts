import { ACTIVE_STATUSES } from "@/lib/constants/status";
import type { InventoryUnit, Sale } from "@/lib/types/database";
import { monthKey } from "@/lib/utils/format";
import { actualProfitCents } from "@/lib/utils/profit";

export interface HomeSummary {
  inventoryCount: number;
  inventoryCostCents: number;
  month: string;
  monthLabel: string;
  monthlySalesCount: number;
  monthlyProfitCents: number;
}

export function buildHomeSummary(
  units: InventoryUnit[],
  sales: Sale[],
  now: Date,
): HomeSummary {
  const month = monthKey(now);
  const validUnits = units.filter((unit) => unit.status !== "refunded");
  const unitMap = new Map(validUnits.map((unit) => [unit.id, unit]));
  const settled = sales.flatMap((sale) => {
    if (
      !sale.settled_at?.startsWith(month) ||
      sale.actual_payout_cents == null
    ) {
      return [];
    }
    const unit = unitMap.get(sale.unit_id);
    if (!unit) return [];
    const profit = actualProfitCents(
      unit.unit_cost_cents,
      unit.outbound_shipping_cents,
      sale.actual_payout_cents,
    );
    return profit == null ? [] : [{ profit }];
  });
  const active = validUnits.filter((unit) =>
    ACTIVE_STATUSES.includes(unit.status),
  );

  return {
    inventoryCount: active.length,
    inventoryCostCents: active.reduce(
      (sum, unit) => sum + unit.unit_cost_cents,
      0,
    ),
    month,
    monthLabel: `${Number(month.slice(5))}月`,
    monthlySalesCount: settled.length,
    monthlyProfitCents: settled.reduce((sum, row) => sum + row.profit, 0),
  };
}
