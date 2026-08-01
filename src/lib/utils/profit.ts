// 利润计算唯一入口：全站所有利润/成本数字都必须从这里出
// 规则（按需求定义，优先级：实际到账 > 预计）：
//   实际利润 = 实际到账 − 分摊采购成本 − 发往得物快递费 − 其他销售费用
//   预计利润 = 售价 − 分摊采购成本 − 平台费用 − 发往得物快递费 − 其他销售费用 + 平台补贴

import type { InventoryUnit, PurchaseBatch, Sale } from "@/lib/types/database";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 分摊后的单件采购成本 = 单价 + (运费 − 优惠) ÷ 数量 */
export function splitUnitCost(
  batch: Pick<
    PurchaseBatch,
    "unit_price" | "shipping_fee" | "discount_amount" | "quantity"
  >,
): number {
  const shared =
    (batch.shipping_fee - batch.discount_amount) / Math.max(1, batch.quantity);
  return round2(batch.unit_price + shared);
}

type SaleNums = Pick<
  Sale,
  | "sold_price"
  | "platform_fee"
  | "platform_subsidy"
  | "express_fee"
  | "other_fee"
  | "actual_payout"
>;

/** 实际利润；未填实际到账返回 null */
export function actualProfit(unitCost: number, sale: SaleNums): number | null {
  if (sale.actual_payout == null) return null;
  return round2(sale.actual_payout - unitCost - sale.express_fee - sale.other_fee);
}

/** 预计利润；未填售价返回 null */
export function expectedProfit(unitCost: number, sale: SaleNums): number | null {
  if (sale.sold_price == null) return null;
  return round2(
    sale.sold_price -
      unitCost -
      sale.platform_fee -
      sale.express_fee -
      sale.other_fee +
      sale.platform_subsidy,
  );
}

export interface ProfitResult {
  kind: "actual" | "expected" | "none";
  value: number | null;
}

/** 单件利润：实际到账优先，其次预计 */
export function unitProfit(
  unit: Pick<InventoryUnit, "unit_cost">,
  sale: SaleNums | null | undefined,
): ProfitResult {
  if (!sale) return { kind: "none", value: null };
  const actual = actualProfit(unit.unit_cost, sale);
  if (actual != null) return { kind: "actual", value: actual };
  const expected = expectedProfit(unit.unit_cost, sale);
  if (expected != null) return { kind: "expected", value: expected };
  return { kind: "none", value: null };
}

/** 利润率 = 利润 ÷ 分摊成本 */
export function profitMargin(profit: number, unitCost: number): number | null {
  if (unitCost <= 0) return null;
  return profit / unitCost;
}

/** 盈亏颜色：正绿负红零灰（iOS 系统色） */
export function profitColor(value: number | null | undefined): string {
  if (value == null || value === 0) return "#8E8E93";
  return value > 0 ? "#34C759" : "#FF3B30";
}

/** 状态停留天数 = 现在 − 最近一次状态变更（无记录则按创建时间） */
export function daysInStatus(
  unit: Pick<InventoryUnit, "created_at">,
  lastChangeAt: string | null,
  now: Date = new Date(),
): number {
  const from = new Date(lastChangeAt ?? unit.created_at).getTime();
  return Math.max(0, Math.floor((now.getTime() - from) / 86_400_000));
}

/** 库存滞留天数 = 现在 − 创建时间（用于滞留榜） */
export function daysSinceCreated(
  unit: Pick<InventoryUnit, "created_at">,
  now: Date = new Date(),
): number {
  return daysInStatus(unit, null, now);
}
