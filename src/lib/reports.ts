// 月度报表聚合：纯函数，输入全量数据，输出报表结构
import type {
  InventoryUnit,
  Product,
  PurchaseBatch,
  Sale,
} from "@/lib/types/database";
import {
  actualProfit,
  expectedProfit,
  profitMargin,
  round2,
  daysSinceCreated,
} from "@/lib/utils/profit";
import { ACTIVE_STATUSES } from "@/lib/constants/status";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants/platform";

export type ReportBasis = "settled" | "sold";

export interface ReportRow {
  unit: InventoryUnit;
  sale: Sale;
  product: Product;
  batch: PurchaseBatch;
  profit: number | null; // 实际优先，其次预计
  profitKind: "actual" | "expected" | "none";
}

export interface MonthlyReport {
  totalSoldAmount: number; // 销售总额
  totalPayout: number; // 实际到账
  actualProfitTotal: number; // 实际利润
  expectedProfitTotal: number; // 预计利润（未结算部分）
  soldCount: number; // 售出数量（按售出日期，独立于口径）
  settledCount: number; // 结算数量（按结算日期，独立于口径）
  avgMargin: number | null; // 平均利润率（已结算部分）
  activeStockCost: number; // 当前库存成本（占用资金）
  dewuStockValue: number; // 得物仓未售出货值（挂牌价，缺省按成本）
  daily: { day: number; profit: number }[]; // 每日利润趋势
  platformRanking: { platform: Platform; label: string; profit: number; count: number }[];
  topProducts: { name: string; profit: number }[];
  losingProducts: { name: string; profit: number }[];
  longestStaying: { id: string; name: string; days: number }[];
  rows: ReportRow[]; // 明细（CSV 导出用）
}

export function buildMonthlyReport(input: {
  units: InventoryUnit[];
  products: Product[];
  batches: PurchaseBatch[];
  sales: Sale[];
  month: string; // YYYY-MM
  basis: ReportBasis;
}): MonthlyReport {
  const { units, products, batches, sales, month, basis } = input;
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  const inMonth = (date: string | null) => date != null && date.startsWith(month);

  // 口径行：按结算日期（默认）或售出日期
  const rows: ReportRow[] = [];
  for (const sale of sales) {
    const hit = basis === "settled" ? inMonth(sale.settled_at) : inMonth(sale.sold_at);
    if (!hit) continue;
    const unit = unitMap.get(sale.unit_id);
    if (!unit) continue;
    const product = productMap.get(unit.product_id);
    const batch = batchMap.get(unit.batch_id);
    if (!product || !batch) continue;
    const actual = actualProfit(unit.unit_cost, sale);
    const expected = expectedProfit(unit.unit_cost, sale);
    rows.push({
      unit,
      sale,
      product,
      batch,
      profit: actual ?? expected,
      profitKind: actual != null ? "actual" : expected != null ? "expected" : "none",
    });
  }

  const totalSoldAmount = round2(
    rows.reduce((s, r) => s + (r.sale.sold_price ?? 0), 0),
  );
  const totalPayout = round2(
    rows.reduce((s, r) => s + (r.sale.actual_payout ?? 0), 0),
  );
  const actualProfitTotal = round2(
    rows.reduce(
      (s, r) => s + (actualProfit(r.unit.unit_cost, r.sale) ?? 0),
      0,
    ),
  );
  const expectedProfitTotal = round2(
    rows
      .filter((r) => r.sale.actual_payout == null)
      .reduce((s, r) => s + (expectedProfit(r.unit.unit_cost, r.sale) ?? 0), 0),
  );

  const soldCount = sales.filter((s) => inMonth(s.sold_at)).length;
  const settledCount = sales.filter((s) => inMonth(s.settled_at)).length;

  // 平均利润率：口径内已结算明细
  const margins = rows
    .map((r) => {
      const p = actualProfit(r.unit.unit_cost, r.sale);
      return p == null ? null : profitMargin(p, r.unit.unit_cost);
    })
    .filter((m): m is number => m != null);
  const avgMargin =
    margins.length > 0
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : null;

  // 库存资金
  const activeStockCost = round2(
    units
      .filter((u) => ACTIVE_STATUSES.includes(u.status))
      .reduce((s, u) => s + u.unit_cost, 0),
  );
  const dewuStockValue = round2(
    units
      .filter((u) => u.status === "in_stock_dewu")
      .reduce((s, u) => s + (u.listing_price ?? u.unit_cost), 0),
  );

  // 每日利润趋势（按口径日期）
  const byDay = new Map<number, number>();
  for (const r of rows) {
    const date = basis === "settled" ? r.sale.settled_at : r.sale.sold_at;
    if (!date || r.profit == null) continue;
    const day = Number(date.slice(8, 10));
    byDay.set(day, round2((byDay.get(day) ?? 0) + r.profit));
  }
  const daily = [...byDay.entries()]
    .map(([day, profit]) => ({ day, profit }))
    .sort((a, b) => a.day - b.day);

  // 采购平台利润排行
  const byPlatform = new Map<Platform, { profit: number; count: number }>();
  for (const r of rows) {
    if (r.profit == null) continue;
    const cur = byPlatform.get(r.batch.platform) ?? { profit: 0, count: 0 };
    cur.profit = round2(cur.profit + r.profit);
    cur.count += 1;
    byPlatform.set(r.batch.platform, cur);
  }
  const platformRanking = [...byPlatform.entries()]
    .map(([platform, v]) => ({
      platform,
      label: PLATFORM_LABELS[platform],
      profit: v.profit,
      count: v.count,
    }))
    .sort((a, b) => b.profit - a.profit);

  // 商品维度
  const byProduct = new Map<string, number>();
  for (const r of rows) {
    if (r.profit == null) continue;
    byProduct.set(
      r.product.name,
      round2((byProduct.get(r.product.name) ?? 0) + r.profit),
    );
  }
  const productEntries = [...byProduct.entries()].map(([name, profit]) => ({
    name,
    profit,
  }));
  const topProducts = productEntries
    .filter((p) => p.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);
  const losingProducts = productEntries
    .filter((p) => p.profit < 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  // 滞留最久的在库商品
  const longestStaying = units
    .filter((u) => ACTIVE_STATUSES.includes(u.status))
    .map((u) => ({
      id: u.id,
      name: productMap.get(u.product_id)?.name ?? "未知商品",
      days: daysSinceCreated(u),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  return {
    totalSoldAmount,
    totalPayout,
    actualProfitTotal,
    expectedProfitTotal,
    soldCount,
    settledCount,
    avgMargin,
    activeStockCost,
    dewuStockValue,
    daily,
    platformRanking,
    topProducts,
    losingProducts,
    longestStaying,
    rows,
  };
}

/** 生成 CSV（含 BOM，Excel 打开中文不乱码） */
export function buildCsv(report: MonthlyReport, month: string, basis: ReportBasis): string {
  const header = [
    "品名",
    "货号",
    "尺码",
    "采购平台",
    "分摊成本",
    "得物售价",
    "平台费用",
    "平台补贴",
    "快递费",
    "其他费用",
    "实际到账",
    "售出日期",
    "结算日期",
    "利润类型",
    "利润",
  ];
  const lines = report.rows.map((r) =>
    [
      r.product.name,
      r.product.style_code ?? "",
      r.unit.size,
      PLATFORM_LABELS[r.batch.platform],
      r.unit.unit_cost,
      r.sale.sold_price ?? "",
      r.sale.platform_fee,
      r.sale.platform_subsidy,
      r.sale.express_fee,
      r.sale.other_fee,
      r.sale.actual_payout ?? "",
      r.sale.sold_at ?? "",
      r.sale.settled_at ?? "",
      r.profitKind === "actual" ? "实际" : r.profitKind === "expected" ? "预计" : "",
      r.profit ?? "",
    ]
      .map(csvCell)
      .join(","),
  );

  const summary = [
    "",
    `月份,${month}`,
    `统计口径,${basis === "settled" ? "按结算日期" : "按售出日期"}`,
    `销售总额,${report.totalSoldAmount}`,
    `实际到账,${report.totalPayout}`,
    `实际利润,${report.actualProfitTotal}`,
    `预计利润,${report.expectedProfitTotal}`,
    `售出数量,${report.soldCount}`,
    `结算数量,${report.settledCount}`,
    `平均利润率,${report.avgMargin != null ? (report.avgMargin * 100).toFixed(1) + "%" : ""}`,
    `当前库存成本,${report.activeStockCost}`,
    `得物仓未售出货值,${report.dewuStockValue}`,
  ];

  return "\uFEFF" + [header.map(csvCell).join(","), ...lines, ...summary].join("\n");
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
