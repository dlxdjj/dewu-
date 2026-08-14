import { ACTIVE_STATUSES } from "@/lib/constants/status";
import type { UnitStatus } from "@/lib/constants/status";
import type { InventoryUnit, MonthlyRebate, Sale, ShippingEvent, ShippingEventItem } from "@/lib/types/database";
import { monthKey } from "@/lib/utils/format";
import { actualProfitCents } from "@/lib/utils/profit";

export interface HomeSummary {
  inventoryCount: number;
  inventoryCostCents: number;
  month: string;
  monthLabel: string;
  monthlySalesCount: number;
  monthlySalesCents: number;
  monthlyShippingCents: number;
  monthlyRebateCents: number;
  monthlyProfitCents: number;
  todoCounts: Pick<Record<UnitStatus, number>, "pending" | "shipping" | "in_stock_dewu" | "sold" | "returned">;
}

export function buildHomeSummary(
  units: InventoryUnit[],
  sales: Sale[],
  rebates: MonthlyRebate[],
  shippingEvents: ShippingEvent[],
  shippingEventItems: ShippingEventItem[],
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
    return profit == null ? [] : [{ profit, payout: sale.actual_payout_cents }];
  });
  const active = validUnits.filter((unit) =>
    ACTIVE_STATUSES.includes(unit.status),
  );
  const monthlyRebateCents = rebates
    .filter((rebate) => rebate.month.startsWith(month))
    .reduce((sum, rebate) => sum + rebate.amount_cents, 0);
  const eventMap = new Map(shippingEvents.map((event) => [event.id, event]));
  const monthlyShippingCents = shippingEventItems
    .filter((item) => item.active)
    .reduce((sum, item) => {
      const event = eventMap.get(item.event_id);
      return event?.shipped_at.startsWith(month)
        ? sum + item.allocated_shipping_cents
        : sum;
    }, 0);
  const count = (status: UnitStatus) =>
    validUnits.filter((unit) => unit.status === status).length;

  return {
    inventoryCount: active.length,
    inventoryCostCents: active.reduce(
      (sum, unit) => sum + unit.unit_cost_cents,
      0,
    ),
    month,
    monthLabel: `${Number(month.slice(5))}月`,
    monthlySalesCount: settled.length,
    monthlySalesCents: settled.reduce((sum, row) => sum + row.payout, 0),
    monthlyShippingCents,
    monthlyRebateCents,
    monthlyProfitCents:
      settled.reduce((sum, row) => sum + row.profit, 0) + monthlyRebateCents,
    todoCounts: {
      pending: count("pending"),
      shipping: count("shipping"),
      in_stock_dewu: count("in_stock_dewu"),
      sold: count("sold"),
      returned: count("returned"),
    },
  };
}
