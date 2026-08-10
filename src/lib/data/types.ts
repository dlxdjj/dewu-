import type { Platform } from "@/lib/constants/platform";
import type { UnitStatus } from "@/lib/constants/status";
import type { Attachment, AttachmentKind, AttachmentOwner, InventoryUnit, Product, PurchaseBatch, Sale, StatusHistory } from "@/lib/types/database";

export interface ShippingAllocation { unitId: string; shippingCents: number; }
export interface ShipUnitsInput { unitIds: string[]; totalShippingCents: number; overwriteConfirmed: boolean; }
export interface ShipUnitsResult { allocations: ShippingAllocation[]; totalShippingCents: number; overwrittenUnitIds: string[]; }
export interface SettleUnitsInput { unitIds: string[]; actualPayoutCents: number; settledAt: string; }
export interface StatusChangeInput { unitIds: string[]; toStatus: UnitStatus; note?: string; }
export interface RefundUnitInput { unitId: string; note?: string; }
export interface DeleteUnitInput { unitId: string; }
export interface DeleteResult { deletedUnitId: string; deletedBatch: boolean; deletedProduct: boolean; pendingStoragePaths: string[]; }
export interface ClearResult { products: number; batches: number; units: number; sales: number; history: number; attachments: number; pendingStoragePaths: string[]; }
export interface CleanupResult { attempted: number; completed: number; pending: number; failedPaths: string[]; }
export interface PurchaseInput {
  productName: string; styleCode: string; platform: Platform; unitPriceCents: number; quantity: number;
  purchasedAt: string; size: string; initialStatus: UnitStatus; orderNo: string; note: string;
}
export interface PurchaseResult { productId: string; batchId: string; unitIds: string[]; }
export interface SaveAttachmentInput { file: Blob; owner_type: AttachmentOwner; owner_id: string; kind: AttachmentKind; }

export interface DbAdapter {
  readonly kind: "supabase" | "memory";
  listProducts(): Promise<Product[]>; listBatches(): Promise<PurchaseBatch[]>; listUnits(): Promise<InventoryUnit[]>;
  listSales(): Promise<Sale[]>; listHistory(unitId?: string): Promise<StatusHistory[]>;
  listAttachments(ownerType: AttachmentOwner, ownerId?: string): Promise<Attachment[]>;
  attachmentUrl(attachment: Attachment): Promise<string>; saveAttachment(input: SaveAttachmentInput): Promise<Attachment>;
  createPurchase(input: PurchaseInput): Promise<PurchaseResult>;
  shipUnits(input: ShipUnitsInput): Promise<ShipUnitsResult>;
  settleUnits(input: SettleUnitsInput): Promise<void>;
  changeStatus(input: StatusChangeInput): Promise<void>;
  refundUnit(input: RefundUnitInput): Promise<void>;
  deleteUnitDeep(input: DeleteUnitInput): Promise<DeleteResult>;
  clearAllData(input: { confirmation: "清空" }): Promise<ClearResult>;
  retryStorageCleanup(): Promise<CleanupResult>;
}
