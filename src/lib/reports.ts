import type {
  InventoryUnit,
  MonthlyRebate,
  Product,
  PurchaseBatch,
  Sale,
  ShippingEvent,
  ShippingEventItem,
} from "@/lib/types/database";
import { REBATE_SOURCE_LABELS } from "@/lib/constants/rebate";
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
  rebateCents: number;
  salesCents: number;
  salesCount: number;
  shippingCents: number;
}

export interface SettlementReport {
  allTime: SettlementSummary;
  selectedMonth: SettlementSummary;
  rows: ReportRow[];
  rebates: MonthlyRebate[];
}

export interface ReportInput {
  units: InventoryUnit[];
  products: Product[];
  batches: PurchaseBatch[];
  sales: Sale[];
  rebates: MonthlyRebate[];
  shippingEvents: ShippingEvent[];
  shippingEventItems: ShippingEventItem[];
  month: string;
  includeRebates?: boolean;
}

function summarize(
  rows: ReportRow[],
  rebateCents: number,
  shippingCents: number,
): SettlementSummary {
  return {
    profitCents: rows.reduce((sum, row) => sum + row.profit, 0) + rebateCents,
    rebateCents,
    salesCents: rows.reduce(
      (sum, row) => sum + (row.sale.actual_payout_cents ?? 0),
      0,
    ),
    salesCount: rows.length,
    shippingCents,
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
  const includedRebates = input.includeRebates === false ? [] : input.rebates;
  const rebates = includedRebates.filter((rebate) =>
    rebate.month.startsWith(input.month),
  );
  const allRebateCents = includedRebates.reduce(
    (sum, rebate) => sum + rebate.amount_cents,
    0,
  );
  const selectedRebateCents = rebates.reduce(
    (sum, rebate) => sum + rebate.amount_cents,
    0,
  );
  const eventMap = new Map(
    input.shippingEvents.map((event) => [event.id, event]),
  );
  const activeShipping = input.shippingEventItems.filter((item) => item.active);
  const shippingCents = (month?: string) =>
    activeShipping.reduce((sum, item) => {
      const event = eventMap.get(item.event_id);
      return event && (!month || event.shipped_at.startsWith(month))
        ? sum + item.allocated_shipping_cents
        : sum;
    }, 0);

  return {
    allTime: summarize(allRows, allRebateCents, shippingCents()),
    selectedMonth: summarize(
      rows,
      selectedRebateCents,
      shippingCents(input.month),
    ),
    rows,
    rebates,
  };
}

export function buildCsv(
  report: SettlementReport,
  month: string,
  options: { includeRebates?: boolean } = {},
): string {
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
  const includeRebates = options.includeRebates !== false;
  const summaryHeader = includeRebates
    ? "范围,利润(分),返利收入(分),运费支出(分),销售额(分),销量"
    : "范围,利润(分),运费支出(分),销售额(分),销量";
  const summaryRow = (label: string, summary: SettlementSummary) =>
    includeRebates
      ? `${label},${summary.profitCents},${summary.rebateCents},${summary.shippingCents},${summary.salesCents},${summary.salesCount}`
      : `${label},${summary.profitCents},${summary.shippingCents},${summary.salesCents},${summary.salesCount}`;
  const lines = [
    summaryHeader,
    summaryRow("历史累计", report.allTime),
    summaryRow(month, report.selectedMonth),
    "",
    detailHeader.join(","),
    ...details,
    ...(includeRebates
      ? [
          "",
          "返利来源,月份,金额(分)",
          ...report.rebates.map((rebate) =>
            [
              REBATE_SOURCE_LABELS[rebate.source],
              rebate.month.slice(0, 7),
              rebate.amount_cents,
            ]
              .map(csv)
              .join(","),
          ),
        ]
      : []),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

function csv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
