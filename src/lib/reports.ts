import type {
  InventoryUnit,
  Product,
  PurchaseBatch,
  Sale,
} from "@/lib/types/database";
import { actualProfitCents } from "@/lib/utils/profit";

export interface ReportRow {
  unit: InventoryUnit;
  sale: Sale;
  product: Product;
  batch: PurchaseBatch;
  profit: number;
}

export interface SettlementSummary {
  profitCents: number;
  salesCents: number;
  salesCount: number;
}

export interface SettlementReport {
  allTime: SettlementSummary;
  selectedMonth: SettlementSummary;
  rows: ReportRow[];
}

export interface ReportInput {
  units: InventoryUnit[];
  products: Product[];
  batches: PurchaseBatch[];
  sales: Sale[];
  month: string;
}

function summarize(rows: ReportRow[]): SettlementSummary {
  return {
    profitCents: rows.reduce((sum, row) => sum + row.profit, 0),
    salesCents: rows.reduce(
      (sum, row) => sum + (row.sale.actual_payout_cents ?? 0),
      0,
    ),
    salesCount: rows.length,
  };
}

export function buildSettlementReport(input: ReportInput): SettlementReport {
  const unitMap = new Map(
    input.units
      .filter((unit) => unit.status !== "refunded")
      .map((unit) => [unit.id, unit]),
  );
  const productMap = new Map(
    input.products.map((product) => [product.id, product]),
  );
  const batchMap = new Map(
    input.batches.map((batch) => [batch.id, batch]),
  );
  const allRows = input.sales.flatMap((sale): ReportRow[] => {
    if (!sale.settled_at || sale.actual_payout_cents == null) return [];
    const unit = unitMap.get(sale.unit_id);
    const product = unit ? productMap.get(unit.product_id) : undefined;
    const batch = unit ? batchMap.get(unit.batch_id) : undefined;
    if (!unit || !product || !batch) return [];
    const profit = actualProfitCents(
      unit.unit_cost_cents,
      unit.outbound_shipping_cents,
      sale.actual_payout_cents,
    );
    return profit == null ? [] : [{ unit, sale, product, batch, profit }];
  });
  const rows = allRows.filter((row) =>
    row.sale.settled_at?.startsWith(input.month),
  );

  return {
    allTime: summarize(allRows),
    selectedMonth: summarize(rows),
    rows,
  };
}

export function buildCsv(report: SettlementReport, month: string): string {
  const detailHeader = [
    "品名",
    "尺码",
    "进价(分)",
    "寄出快递费(分)",
    "实际到账(分)",
    "利润(分)",
    "结算日期",
  ];
  const details = report.rows.map((row) =>
    [
      row.product.name,
      row.unit.size,
      row.unit.unit_cost_cents,
      row.unit.outbound_shipping_cents,
      row.sale.actual_payout_cents ?? "",
      row.profit,
      row.sale.settled_at ?? "",
    ]
      .map(csv)
      .join(","),
  );
  const lines = [
    "范围,利润(分),销售额(分),销量",
    `历史累计,${report.allTime.profitCents},${report.allTime.salesCents},${report.allTime.salesCount}`,
    `${month},${report.selectedMonth.profitCents},${report.selectedMonth.salesCents},${report.selectedMonth.salesCount}`,
    "",
    detailHeader.join(","),
    ...details,
  ];
  return `\uFEFF${lines.join("\n")}`;
}

function csv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
