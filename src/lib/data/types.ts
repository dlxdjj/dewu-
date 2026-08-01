// 数据访问层统一接口：本地实现与 Supabase 实现可互换
import type {
  Attachment,
  AttachmentKind,
  AttachmentOwner,
  InventoryUnit,
  Product,
  PurchaseBatch,
  Sale,
  StatusHistory,
} from "@/lib/types/database";

export type NewProduct = Omit<Product, "id" | "created_at" | "updated_at">;
export type NewBatch = Omit<PurchaseBatch, "id" | "created_at" | "updated_at">;
export type NewUnit = Omit<InventoryUnit, "id" | "created_at" | "updated_at">;
export type NewSale = Omit<Sale, "id" | "created_at" | "updated_at">;
export type NewHistory = Omit<StatusHistory, "id" | "created_at">;

export interface SaveAttachmentInput {
  file: Blob;
  owner_type: AttachmentOwner;
  owner_id: string;
  kind: AttachmentKind;
}

export interface DbAdapter {
  readonly kind: "local" | "supabase";

  listProducts(): Promise<Product[]>;
  createProduct(input: NewProduct): Promise<Product>;
  updateProduct(id: string, patch: Partial<NewProduct>): Promise<Product>;

  listBatches(): Promise<PurchaseBatch[]>;
  createBatch(input: NewBatch): Promise<PurchaseBatch>;

  listUnits(): Promise<InventoryUnit[]>;
  createUnits(inputs: NewUnit[]): Promise<InventoryUnit[]>;
  updateUnit(id: string, patch: Partial<NewUnit>): Promise<InventoryUnit>;
  /** 删除单件（级联删除其状态历史与销售记录），用于数量调整 */
  deleteUnit(id: string): Promise<void>;

  listSales(): Promise<Sale[]>;
  /** 按 unit_id 覆盖写（一件库存只有一条销售记录） */
  upsertSale(input: NewSale): Promise<Sale>;
  /** 删除某单件的销售记录（回退「售出」时使用） */
  deleteSaleByUnit(unitId: string): Promise<void>;

  listHistory(unitId?: string): Promise<StatusHistory[]>;
  addHistory(entries: NewHistory[]): Promise<void>;

  saveAttachment(input: SaveAttachmentInput): Promise<Attachment>;
  listAttachments(
    owner_type: AttachmentOwner,
    owner_id: string,
  ): Promise<Attachment[]>;
  /** 可直接在 <img src> 使用的 URL（本地为 objectURL） */
  attachmentUrl(att: Attachment): Promise<string>;
}
