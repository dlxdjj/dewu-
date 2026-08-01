// 采购入库服务：创建商品/批次/单件库存/附件/初始状态记录的完整流程
import type { DbAdapter } from "@/lib/data/types";
import type { Platform } from "@/lib/constants/platform";
import type { UnitStatus } from "@/lib/constants/status";
import { splitUnitCost } from "@/lib/utils/profit";

export interface PurchaseInput {
  // 商品信息
  productName: string;
  styleCode: string;
  productImage: Blob | null;
  // 采购信息
  platform: Platform;
  unitPrice: number;
  quantity: number;
  shippingFee: number;
  discountAmount: number;
  purchasedAt: string; // YYYY-MM-DD
  size: string;
  // 订单与物流
  initialStatus: UnitStatus;
  orderNo: string;
  orderScreenshot: Blob | null;
  note: string;
}

export interface PurchaseResult {
  productId: string;
  batchId: string;
  unitIds: string[];
}

export async function createPurchase(
  db: DbAdapter,
  input: PurchaseInput,
): Promise<PurchaseResult> {
  // 1. 商品：货号相同则复用，否则新建
  const styleCode = input.styleCode.trim();
  const products = await db.listProducts();
  let product = styleCode
    ? products.find(
        (p) => (p.style_code ?? "").toLowerCase() === styleCode.toLowerCase(),
      )
    : undefined;
  if (!product) {
    product = await db.createProduct({
      name: input.productName.trim(),
      style_code: styleCode || null,
      brand: null,
    });
  }

  // 2. 商品图片（挂在商品上）
  if (input.productImage) {
    await db.saveAttachment({
      file: input.productImage,
      owner_type: "product",
      owner_id: product.id,
      kind: "product_image",
    });
  }

  // 3. 采购批次
  const batch = await db.createBatch({
    product_id: product.id,
    platform: input.platform,
    order_no: input.orderNo.trim() || null,
    unit_price: input.unitPrice,
    quantity: input.quantity,
    shipping_fee: input.shippingFee,
    discount_amount: input.discountAmount,
    purchased_at: input.purchasedAt,
    note: input.note.trim() || null,
  });

  // 4. 采购订单截图（挂在批次上）
  if (input.orderScreenshot) {
    await db.saveAttachment({
      file: input.orderScreenshot,
      owner_type: "batch",
      owner_id: batch.id,
      kind: "order_screenshot",
    });
  }

  // 5. 按数量生成单件库存（每件独立 ID，分摊成本）
  const unitCost = splitUnitCost(batch);
  const units = await db.createUnits(
    Array.from({ length: input.quantity }, () => ({
      batch_id: batch.id,
      product_id: product.id,
      size: input.size.trim(),
      unit_cost: unitCost,
      listing_price: null,
      status: input.initialStatus,
    })),
  );

  // 6. 初始状态记录
  await db.addHistory(
    units.map((u) => ({
      unit_id: u.id,
      from_status: null,
      to_status: input.initialStatus,
      note: "采购入库",
    })),
  );

  return { productId: product.id, batchId: batch.id, unitIds: units.map((u) => u.id) };
}
