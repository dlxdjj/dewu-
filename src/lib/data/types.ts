import type { Platform } from "@/lib/constants/platform";
import type { UnitStatus } from "@/lib/constants/status";
import type { AccountPreferences, Attachment, AttachmentKind, AttachmentOwner, CatalogProduct, InventoryUnit, MonthlyRebate, Product, PurchaseBatch, Sale, ShippingEvent, ShippingEventItem, StatusHistory, UnitJoined } from "@/lib/types/database";

export interface ShippingAllocation { unitId: string; shippingCents: number; }
export interface ShipUnitsInput {
  unitIds: string[];
  totalShippingCents: number;
  mode: "append" | "replace";
  shippedAt: string;
}
export interface ShipUnitsResult { allocations: ShippingAllocation[]; totalShippingCents: number; overwrittenUnitIds: string[]; }
export interface SettleUnitsInput { unitIds: string[]; actualPayoutCents: number; settledAt: string; }
export interface StatusChangeInput { unitIds: string[]; toStatus: UnitStatus; note?: string; }
export interface RefundUnitInput { unitId: string; note?: string; }
export interface SaveMonthlyRebatesInput { month: string; taobaoAllianceCents: number; jingfenCents: number; }
export interface DeleteUnitInput { unitId: string; }
export interface DeleteResult { deletedUnitId: string; deletedBatch: boolean; deletedProduct: boolean; pendingStoragePaths: string[]; }
export interface ClearResult { products: number; batches: number; units: number; sales: number; rebates: number; history: number; attachments: number; pendingStoragePaths: string[]; }
export interface CleanupResult { attempted: number; completed: number; pending: number; failedPaths: string[]; }
export interface PurchaseInput {
  productName: string; styleCode: string; platform: Platform; unitPriceCents: number; quantity: number;
  purchasedAt: string; size: string; initialStatus: UnitStatus; orderNo: string; note: string;
}
export interface PurchaseResult { productId: string; batchId: string; unitIds: string[]; }
export interface SaveAttachmentInput { file: Blob; owner_type: AttachmentOwner; owner_id: string; kind: AttachmentKind; }
export interface SpreadsheetImportRow {
  rowNumber: number;
  styleCode: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  size: string;
}
export interface ImportPurchasesInput {
  rows: SpreadsheetImportRow[];
  fileHash: string;
  purchasedAt: string;
}
export interface ImportPurchasesResult {
  importId: string;
  rowCount: number;
  unitCount: number;
  totalCostCents: number;
  matchedRows: number;
  unmatchedRows: number;
}
export interface UnitSizeAssignment { unitId: string; size: string; }

export type InventoryView = "active" | "settlement" | "sales" | "refunds";
export type InventorySort =
  | "purchase_desc"
  | "purchase_asc"
  | "cost_desc"
  | "cost_asc"
  | "profit_desc"
  | "profit_asc";
export interface InventoryPageInput {
  view: InventoryView;
  status: UnitStatus | "all";
  platform: Platform | "all";
  query: string;
  missingSizeOnly: boolean;
  sort: InventorySort;
  limit: number;
  offset: number;
}
export interface InventoryGroupPageRow {
  key: string;
  product: Product;
  styleCode: string | null;
  size: string;
  totalCostCents: number;
  platforms: Platform[];
  statusCounts: Partial<Record<UnitStatus, number>>;
  units: UnitJoined[];
  purchasedAt: string;
  profitCents: number;
}
export interface InventoryPageResult {
  groups: InventoryGroupPageRow[];
  totalGroups: number;
  totalUnits: number;
  counts: Record<InventoryView, number>;
  availablePlatforms: Platform[];
}
export interface HomeDashboardResult {
  inventoryCount: number;
  inventoryCostCents: number;
  month: string;
  monthLabel: string;
  monthlySalesCount: number;
  monthlySalesCents: number;
  monthlyShippingCents: number;
  monthlyRebateCents: number;
  monthlyProfitCents: number;
  rebatesEnabled: boolean;
  todoCounts: Pick<Record<UnitStatus, number>, "pending" | "arrived" | "shipping" | "in_stock_dewu" | "sold" | "returned">;
}
export interface ReportSummaryResult {
  profitCents: number;
  rebateCents: number;
  salesCents: number;
  salesCount: number;
  shippingCents: number;
}
export interface ReportDashboardRow {
  unit: InventoryUnit;
  sale: Sale;
  product: Product;
  batch: PurchaseBatch;
  profit: number;
}
export interface ReportDashboardInput {
  month: string;
  limit: number;
  offset: number;
  lossesOnly: boolean;
}
export interface ReportDashboardResult {
  allTime: ReportSummaryResult;
  selectedMonth: ReportSummaryResult;
  rows: ReportDashboardRow[];
  totalRows: number;
  rebatesEnabled: boolean;
  rebates: MonthlyRebate[];
}
export interface ClientEventSummary {
  errors: number;
  slowRequests: number;
  imageErrors: number;
  lastEventAt: string | null;
}

export interface DbAdapter {
  readonly kind: "supabase" | "memory";
  listProducts(): Promise<Product[]>; listBatches(): Promise<PurchaseBatch[]>; listUnits(): Promise<InventoryUnit[]>;
  listSales(): Promise<Sale[]>; listHistory(unitId?: string): Promise<StatusHistory[]>;
  listRebates(): Promise<MonthlyRebate[]>;
  getAccountPreferences(): Promise<AccountPreferences>;
  listCatalogProducts(): Promise<CatalogProduct[]>;
  listShippingEvents(): Promise<ShippingEvent[]>;
  listShippingEventItems(): Promise<ShippingEventItem[]>;
  listAttachments(ownerType: AttachmentOwner, ownerId?: string): Promise<Attachment[]>;
  listAttachmentsByOwnerIds?(ownerType: AttachmentOwner, ownerIds: string[]): Promise<Attachment[]>;
  getHomeDashboard(month: string): Promise<HomeDashboardResult>;
  listInventoryGroupsPage(input: InventoryPageInput): Promise<InventoryPageResult>;
  getReportDashboard(input: ReportDashboardInput): Promise<ReportDashboardResult>;
  getClientEventSummary(): Promise<ClientEventSummary>;
  attachmentUrl(attachment: Attachment): Promise<string>; saveAttachment(input: SaveAttachmentInput): Promise<Attachment>;
  catalogImageUrl(catalogProduct: CatalogProduct): Promise<string>;
  createPurchase(input: PurchaseInput): Promise<PurchaseResult>;
  importPurchases(input: ImportPurchasesInput): Promise<ImportPurchasesResult>;
  assignUnitSizes(assignments: UnitSizeAssignment[]): Promise<number>;
  shipUnits(input: ShipUnitsInput): Promise<ShipUnitsResult>;
  settleUnits(input: SettleUnitsInput): Promise<void>;
  changeStatus(input: StatusChangeInput): Promise<void>;
  refundUnit(input: RefundUnitInput): Promise<void>;
  saveMonthlyRebates(input: SaveMonthlyRebatesInput): Promise<MonthlyRebate[]>;
  deleteUnitDeep(input: DeleteUnitInput): Promise<DeleteResult>;
  clearAllData(input: { confirmation: "清空" }): Promise<ClearResult>;
  retryStorageCleanup(): Promise<CleanupResult>;
}
