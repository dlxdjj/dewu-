// 与 supabase/migrations/0001_init.sql 对应的类型
// 接入真实项目后可改用 `supabase gen types typescript` 自动生成替换

import type { UnitStatus } from "@/lib/constants/status";
import type { Platform } from "@/lib/constants/platform";

export interface Product {
  id: string;
  name: string;
  style_code: string | null;
  brand: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseBatch {
  id: string;
  product_id: string;
  platform: Platform;
  order_no: string | null;
  unit_price: number;
  quantity: number;
  shipping_fee: number;
  discount_amount: number;
  purchased_at: string; // YYYY-MM-DD
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryUnit {
  id: string;
  batch_id: string;
  product_id: string;
  size: string;
  unit_cost: number; // 分摊后采购成本
  listing_price: number | null; // 得物挂牌价（可选）
  status: UnitStatus;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  unit_id: string;
  sold_price: number | null;
  platform_fee: number;
  platform_subsidy: number;
  express_fee: number;
  other_fee: number;
  actual_payout: number | null;
  sold_at: string | null; // YYYY-MM-DD
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AttachmentOwner = "product" | "batch" | "unit" | "sale";
export type AttachmentKind = "product_image" | "order_screenshot";

export interface Attachment {
  id: string;
  owner_type: AttachmentOwner;
  owner_id: string;
  kind: AttachmentKind;
  path: string; // Supabase Storage 路径；本地实现为 local:<id>
  content_type: string | null;
  created_at: string;
}

export interface StatusHistory {
  id: number;
  unit_id: string;
  from_status: UnitStatus | null;
  to_status: UnitStatus;
  note: string | null;
  created_at: string;
}

/** 列表/详情常用的联查形状 */
export interface UnitJoined extends InventoryUnit {
  product: Product;
  batch: PurchaseBatch;
  sale: Sale | null;
}
