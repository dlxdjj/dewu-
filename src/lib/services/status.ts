import type { UnitStatus } from "@/lib/constants/status";
import type { DbAdapter } from "@/lib/data/types";
import type { InventoryUnit } from "@/lib/types/database";
import { parseYuanToCents } from "@/lib/utils/money";

export async function changeUnitStatus(db: DbAdapter, unit: InventoryUnit, to: UnitStatus, options: { note?: string } = {}): Promise<void> {
  if (unit.status === to) throw new Error("目标状态与当前状态相同");
  if (to === "refunded") return db.refundUnit({ unitId: unit.id, note: options.note });
  if (to === "settled") throw new Error("结算必须登记实际到手价和结算日期");
  return db.changeStatus({ unitIds: [unit.id], toStatus: to, note: options.note });
}
export async function batchChangeStatus(db: DbAdapter, units: InventoryUnit[], to: UnitStatus, options: { note?: string } = {}): Promise<void> {
  if (units.length < 1) throw new Error("至少选择一件商品");
  if (to === "refunded") throw new Error("采购退款需逐件确认并填写可选备注");
  if (to === "settled") throw new Error("批量结算请使用“录到手价”并填写结算日期");
  const changeable = units.filter((unit) => unit.status !== to);
  if (!changeable.length) throw new Error("所选商品已经是目标状态");
  return db.changeStatus({ unitIds: changeable.map((unit) => unit.id), toStatus: to, note: options.note });
}
export async function settleUnits(db: DbAdapter, unitIds: string[], payoutYuan: string, settledAt: string): Promise<void> {
  if (unitIds.length < 1) throw new Error("至少选择一件商品");
  await db.settleUnits({ unitIds, actualPayoutCents: parseYuanToCents(payoutYuan), settledAt });
}
export async function refundUnit(db: DbAdapter, unitId: string, note?: string): Promise<void> { await db.refundUnit({ unitId, note }); }
