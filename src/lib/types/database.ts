import type { UnitStatus } from "@/lib/constants/status";
import type { Platform } from "@/lib/constants/platform";

interface OwnedRow { id: string; user_id: string; created_at: string; }

export interface Product extends OwnedRow { name: string; style_code: string | null; brand: string | null; updated_at: string; }
export interface PurchaseBatch extends OwnedRow {
  product_id: string; platform: Platform; order_no: string | null; unit_price_cents: number;
  quantity: number; shipping_fee_cents: number; discount_amount_cents: number;
  purchased_at: string; note: string | null; updated_at: string;
}
export interface InventoryUnit extends OwnedRow {
  batch_id: string; product_id: string; size: string; unit_cost_cents: number;
  listing_price_cents: number | null; outbound_shipping_cents: number; status: UnitStatus; updated_at: string;
}
export interface Sale extends OwnedRow {
  unit_id: string; sold_price_cents: number | null; platform_fee_cents: number;
  platform_subsidy_cents: number; express_fee_cents: number; other_fee_cents: number;
  actual_payout_cents: number | null; sold_at: string | null; settled_at: string | null; updated_at: string;
}
export type AttachmentOwner = "product" | "batch" | "unit" | "sale";
export type AttachmentKind = "product_image" | "order_screenshot";
export interface Attachment extends OwnedRow { owner_type: AttachmentOwner; owner_id: string; kind: AttachmentKind; path: string; content_type: string | null; }
export interface StatusHistory extends OwnedRow { id: string; unit_id: string; from_status: UnitStatus | null; to_status: UnitStatus; note: string | null; }
export interface StorageDeletionJob extends OwnedRow { path: string; completed_at: string | null; }
export interface UnitJoined extends InventoryUnit { product: Product; batch: PurchaseBatch; sale: Sale | null; }
