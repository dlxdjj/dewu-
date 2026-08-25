import { supportsRebateIncome } from "@/lib/account-features";
import { PLATFORM_LABELS } from "@/lib/constants/platform";
import { ACTIVE_STATUSES } from "@/lib/constants/status";
import { buildHomeSummary } from "@/lib/home-summary";
import { buildSettlementReport } from "@/lib/reports";
import { actualProfitCents } from "@/lib/utils/profit";
import { buildGroups } from "@/lib/utils/group";
import type {
  DbAdapter,
  HomeDashboardResult,
  InventoryPageInput,
  InventoryPageResult,
  ReportDashboardInput,
  ReportDashboardResult,
} from "@/lib/data/types";
import type { UnitJoined } from "@/lib/types/database";

type ReadAdapter = Pick<
  DbAdapter,
  | "getAccountPreferences"
  | "listUnits"
  | "listProducts"
  | "listBatches"
  | "listSales"
  | "listRebates"
  | "listShippingEvents"
  | "listShippingEventItems"
>;

async function joinedUnits(db: ReadAdapter): Promise<UnitJoined[]> {
  const [units, products, batches, sales] = await Promise.all([
    db.listUnits(),
    db.listProducts(),
    db.listBatches(),
    db.listSales(),
  ]);
  const productMap = new Map(products.map((row) => [row.id, row]));
  const batchMap = new Map(batches.map((row) => [row.id, row]));
  const saleMap = new Map(sales.map((row) => [row.unit_id, row]));
  return units.flatMap((unit): UnitJoined[] => {
    const product = productMap.get(unit.product_id);
    const batch = batchMap.get(unit.batch_id);
    return product && batch
      ? [{ ...unit, product, batch, sale: saleMap.get(unit.id) ?? null }]
      : [];
  });
}

export async function legacyHomeDashboard(
  db: ReadAdapter,
  month: string,
): Promise<HomeDashboardResult> {
  const preferences = await db.getAccountPreferences();
  const rebatesEnabled = supportsRebateIncome(preferences.workflow);
  const [units, sales, rebates, shippingEvents, shippingEventItems] =
    await Promise.all([
      db.listUnits(),
      db.listSales(),
      rebatesEnabled ? db.listRebates() : Promise.resolve([]),
      db.listShippingEvents(),
      db.listShippingEventItems(),
    ]);
  const summary = buildHomeSummary(
    units,
    sales,
    rebates,
    shippingEvents,
    shippingEventItems,
    new Date(`${month}-15T12:00:00`),
  );
  return { ...summary, rebatesEnabled };
}

export async function legacyInventoryGroupsPage(
  db: ReadAdapter,
  input: InventoryPageInput,
): Promise<InventoryPageResult> {
  const all = await joinedUnits(db);
  const needle = input.query.trim().toLocaleLowerCase();
  const filtered = all.filter((unit) => {
    const inView = input.view === "active"
      ? ACTIVE_STATUSES.includes(unit.status)
      : input.view === "settlement"
        ? unit.status === "sold"
        : input.view === "sales"
          ? unit.status === "settled"
          : unit.status === "refunded";
    if (!inView) return false;
    if (
      input.view === "active" &&
      input.status !== "all" &&
      unit.status !== input.status
    ) return false;
    if (input.platform !== "all" && unit.batch.platform !== input.platform) {
      return false;
    }
    if (input.missingSizeOnly && unit.size.trim()) return false;
    if (!needle) return true;
    return [
      unit.product.name,
      unit.product.style_code,
      unit.size,
      unit.batch.order_no,
      PLATFORM_LABELS[unit.batch.platform],
    ].some((value) => value?.toLocaleLowerCase().includes(needle));
  });
  const rows = buildGroups(filtered).map((group) => {
    const purchasedAt = group.units.reduce(
      (latest, unit) =>
        unit.batch.purchased_at > latest ? unit.batch.purchased_at : latest,
      "",
    );
    const profitCents = group.units.reduce((sum, unit) =>
      sum + (actualProfitCents(
        unit.unit_cost_cents,
        unit.outbound_shipping_cents,
        unit.sale?.actual_payout_cents ?? null,
      ) ?? 0), 0);
    return { ...group, purchasedAt, profitCents };
  });
  rows.sort((left, right) => {
    switch (input.sort) {
      case "purchase_asc": return left.purchasedAt.localeCompare(right.purchasedAt);
      case "cost_desc": return right.totalCostCents - left.totalCostCents;
      case "cost_asc": return left.totalCostCents - right.totalCostCents;
      case "profit_desc": return right.profitCents - left.profitCents;
      case "profit_asc": return left.profitCents - right.profitCents;
      default: return right.purchasedAt.localeCompare(left.purchasedAt);
    }
  });
  const counts = {
    active: all.filter((unit) => ACTIVE_STATUSES.includes(unit.status)).length,
    settlement: all.filter((unit) => unit.status === "sold").length,
    sales: all.filter((unit) => unit.status === "settled").length,
    refunds: all.filter((unit) => unit.status === "refunded").length,
  };
  return {
    groups: rows.slice(input.offset, input.offset + input.limit),
    totalGroups: rows.length,
    totalUnits: filtered.length,
    counts,
    availablePlatforms: [
      ...new Set(all.map((unit) => unit.batch.platform)),
    ],
  };
}

export async function legacyReportDashboard(
  db: ReadAdapter,
  input: ReportDashboardInput,
): Promise<ReportDashboardResult> {
  const preferences = await db.getAccountPreferences();
  const rebatesEnabled = supportsRebateIncome(preferences.workflow);
  const [units, products, batches, sales, rebates, shippingEvents, shippingEventItems] =
    await Promise.all([
      db.listUnits(),
      db.listProducts(),
      db.listBatches(),
      db.listSales(),
      rebatesEnabled ? db.listRebates() : Promise.resolve([]),
      db.listShippingEvents(),
      db.listShippingEventItems(),
    ]);
  const report = buildSettlementReport({
    units,
    products,
    batches,
    sales,
    rebates,
    shippingEvents,
    shippingEventItems,
    month: input.month,
    includeRebates: rebatesEnabled,
  });
  const filtered = input.lossesOnly
    ? report.rows.filter((row) => row.profit < 0)
    : report.rows;
  return {
    allTime: report.allTime,
    selectedMonth: report.selectedMonth,
    rows: filtered.slice(input.offset, input.offset + input.limit),
    totalRows: filtered.length,
    rebatesEnabled,
    rebates: report.rebates,
  };
}
