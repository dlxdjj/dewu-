// Supabase 实现：结构与本地实现完全对齐
// 注意：需在 .env.local 配置环境变量并在 Supabase 执行 0001_init.sql 后生效
import { getSupabase } from "@/lib/supabase/client";
import type {
  Attachment,
  InventoryUnit,
  Product,
  PurchaseBatch,
  Sale,
  StatusHistory,
} from "@/lib/types/database";
import type {
  DbAdapter,
  NewBatch,
  NewHistory,
  NewProduct,
  NewSale,
  NewUnit,
  SaveAttachmentInput,
} from "./types";

const BUCKET = "attachments";

function must<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export function createSupabaseAdapter(): DbAdapter {
  const sb = getSupabase();

  return {
    kind: "supabase",

    async listProducts() {
      const { data, error } = await sb.from("products").select("*").order("created_at");
      return must<Product[]>(data, error);
    },
    async createProduct(input: NewProduct) {
      const { data, error } = await sb.from("products").insert(input).select().single();
      return must<Product>(data, error);
    },
    async updateProduct(id, patch) {
      const { data, error } = await sb.from("products").update(patch).eq("id", id).select().single();
      return must<Product>(data, error);
    },

    async listBatches() {
      const { data, error } = await sb.from("purchase_batches").select("*").order("purchased_at", { ascending: false });
      return must<PurchaseBatch[]>(data, error);
    },
    async createBatch(input: NewBatch) {
      const { data, error } = await sb.from("purchase_batches").insert(input).select().single();
      return must<PurchaseBatch>(data, error);
    },

    async listUnits() {
      const { data, error } = await sb.from("inventory_units").select("*").order("created_at", { ascending: false });
      return must<InventoryUnit[]>(data, error);
    },
    async createUnits(inputs: NewUnit[]) {
      const { data, error } = await sb.from("inventory_units").insert(inputs).select();
      return must<InventoryUnit[]>(data, error);
    },
    async updateUnit(id, patch) {
      const { data, error } = await sb.from("inventory_units").update(patch).eq("id", id).select().single();
      return must<InventoryUnit>(data, error);
    },
    async deleteUnit(id) {
      // status_history 有 on delete cascade；sales 需手动删
      const { error: saleErr } = await sb.from("sales").delete().eq("unit_id", id);
      if (saleErr) throw new Error(saleErr.message);
      const { error } = await sb.from("inventory_units").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },

    async listSales() {
      const { data, error } = await sb.from("sales").select("*");
      return must<Sale[]>(data, error);
    },
    async upsertSale(input: NewSale) {
      const { data, error } = await sb
        .from("sales")
        .upsert(input, { onConflict: "unit_id" })
        .select()
        .single();
      return must<Sale>(data, error);
    },
    async deleteSaleByUnit(unitId) {
      const { error } = await sb.from("sales").delete().eq("unit_id", unitId);
      if (error) throw new Error(error.message);
    },

    async listHistory(unitId?: string) {
      let q = sb.from("status_history").select("*").order("created_at");
      if (unitId) q = q.eq("unit_id", unitId);
      const { data, error } = await q;
      return must<StatusHistory[]>(data, error);
    },
    async addHistory(entries: NewHistory[]) {
      const { error } = await sb.from("status_history").insert(entries);
      if (error) throw new Error(error.message);
    },

    async saveAttachment({ file, owner_type, owner_id, kind }: SaveAttachmentInput) {
      const path = `${owner_type}/${owner_id}/${crypto.randomUUID()}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
      });
      if (upErr) throw new Error(upErr.message);
      const { data, error } = await sb
        .from("attachments")
        .insert({
          owner_type,
          owner_id,
          kind,
          path,
          content_type: file.type || null,
        })
        .select()
        .single();
      return must<Attachment>(data, error);
    },
    async listAttachments(owner_type, owner_id) {
      const { data, error } = await sb
        .from("attachments")
        .select("*")
        .eq("owner_type", owner_type)
        .eq("owner_id", owner_id)
        .order("created_at");
      return must<Attachment[]>(data, error);
    },
    async attachmentUrl(att) {
      const { data } = sb.storage.from(BUCKET).getPublicUrl(att.path);
      return data.publicUrl;
    },
  };
}
