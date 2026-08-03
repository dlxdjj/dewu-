import type { Platform } from "@/lib/constants/platform";
import type { UnitStatus } from "@/lib/constants/status";
import type { DbAdapter, PurchaseResult } from "@/lib/data/types";
import { parseYuanToCents } from "@/lib/utils/money";

export interface PurchaseFormInput { productName: string; styleCode?: string; platform: Platform; unitPriceYuan: string; quantity: number; purchasedAt: string; size: string; initialStatus: UnitStatus; orderNo?: string; note?: string; }

export async function createPurchase(db: DbAdapter, input: PurchaseFormInput): Promise<PurchaseResult> {
  const productName = input.productName.trim();
  if (!productName) throw new Error("请填写品名");
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) throw new Error("数量需为 1 至 999 的整数");
  if (!input.size.trim()) throw new Error("请填写尺码");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchasedAt)) throw new Error("采购日期格式不正确");
  return db.createPurchase({ productName, styleCode: input.styleCode?.trim() ?? "", platform: input.platform, unitPriceCents: parseYuanToCents(input.unitPriceYuan), quantity: input.quantity, purchasedAt: input.purchasedAt, size: input.size.trim(), initialStatus: input.initialStatus, orderNo: input.orderNo?.trim() ?? "", note: input.note?.trim() ?? "" });
}
