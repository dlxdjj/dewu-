import { canTransition, type UnitStatus } from "@/lib/constants/status";
import type { DbAdapter } from "@/lib/data/types";
import type { InventoryUnit } from "@/lib/types/database";
import { parseYuanToCents } from "@/lib/utils/money";

export async function changeUnitStatus(
  db: DbAdapter,
  unit: InventoryUnit,
  to: UnitStatus,
  options: { note?: string; allowCorrection?: boolean } = {},
): Promise<void> {
  if (unit.status === to) throw new Error("目标状态与当前状态相同");
  if (!options.allowCorrection && !canTransition(unit.status, to)) {
    throw new Error("当前状态不能直接执行这项操作");
  }
  if (to === "refunded") return db.refundUnit({ unitId: unit.id, note: options.note });
  if (to === "settled") throw new Error("结算必须登记实际到手价和结算日期");
  if (to === "shipping") throw new Error("寄出必须先录入快递费");
  return db.changeStatus({ unitIds: [unit.id], toStatus: to, note: options.note });
}
export async function batchChangeStatus(db: DbAdapter, units: InventoryUnit[], to: UnitStatus, options: { note?: string } = {}): Promise<void> {
  if (units.length < 1) throw new Error("至少选择一件商品");
  if (to === "refunded") throw new Error("采购退款需逐件确认并填写可选备注");
  if (to === "settled") throw new Error("批量结算请使用“录到手价”并填写结算日期");
  if (to === "shipping") throw new Error("批量寄出请使用“批量寄出”并录入总快递费");
  const changeable = units.filter((unit) => unit.status !== to);
  if (!changeable.length) throw new Error("所选商品已经是目标状态");
  if (changeable.some((unit) => !canTransition(unit.status, to))) {
    throw new Error("所选商品包含不能直接执行此操作的状态");
  }
  return db.changeStatus({ unitIds: changeable.map((unit) => unit.id), toStatus: to, note: options.note });
}
export async function settleUnits(db: DbAdapter, unitIds: string[], payoutYuan: string, settledAt: string): Promise<void> {
  if (unitIds.length < 1) throw new Error("至少选择一件商品");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settledAt)) throw new Error("请选择结算日期");
  await db.settleUnits({ unitIds, actualPayoutCents: parseYuanToCents(payoutYuan), settledAt });
}

export interface UnitPayoutEntry {
  unitId: string;
  payoutYuan: string;
}

/**
 * 支持同一批商品填写不同到手价。相同金额合并调用现有原子 RPC，
 * 避免为这一项前端能力增加新的数据库迁移。
 */
export async function settleUnitPayouts(
  db: DbAdapter,
  entries: UnitPayoutEntry[],
  settledAt: string,
): Promise<void> {
  if (!entries.length) throw new Error("至少选择一件商品");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settledAt)) throw new Error("请选择结算日期");
  if (new Set(entries.map((entry) => entry.unitId)).size !== entries.length) {
    throw new Error("商品 ID 不得重复");
  }
  const groups = new Map<number, string[]>();
  for (const entry of entries) {
    const cents = parseYuanToCents(entry.payoutYuan);
    groups.set(cents, [...(groups.get(cents) ?? []), entry.unitId]);
  }
  for (const [actualPayoutCents, unitIds] of groups) {
    await db.settleUnits({ unitIds, actualPayoutCents, settledAt });
  }
}

/** 登记售出：空金额进入待结算，已填写金额则直接完成结算。 */
export async function registerUnitSales(
  db: DbAdapter,
  units: InventoryUnit[],
  entries: UnitPayoutEntry[],
  settledAt: string,
): Promise<{ pending: number; settled: number }> {
  if (!units.length || units.length !== entries.length) {
    throw new Error("售出商品资料不完整");
  }
  const unitMap = new Map(units.map((unit) => [unit.id, unit]));
  if (entries.some((entry) => !unitMap.has(entry.unitId))) {
    throw new Error("售出商品资料不匹配");
  }
  if (units.some((unit) => unit.status !== "in_stock_dewu")) {
    throw new Error("只有得物仓未售商品可以登记售出");
  }
  const pendingEntries = entries.filter((entry) => !entry.payoutYuan.trim());
  const settledEntries = entries.filter((entry) => entry.payoutYuan.trim());
  if (settledEntries.length) {
    await settleUnitPayouts(db, settledEntries, settledAt);
  }
  if (pendingEntries.length) {
    await batchChangeStatus(
      db,
      pendingEntries.map((entry) => unitMap.get(entry.unitId)!),
      "sold",
      { note: "登记售出，待录入到手价" },
    );
  }
  return { pending: pendingEntries.length, settled: settledEntries.length };
}
export async function refundUnit(db: DbAdapter, unitId: string, note?: string): Promise<void> { await db.refundUnit({ unitId, note }); }
