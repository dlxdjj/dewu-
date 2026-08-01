// 状态变更服务：状态直达（任意互转）→ 维护销售记录 → 自动写 status_history
import type { DbAdapter, NewSale } from "@/lib/data/types";
import type { InventoryUnit } from "@/lib/types/database";
import { SALE_STATUSES, STATUS_META, type UnitStatus } from "@/lib/constants/status";

export interface StatusChangeOptions {
  note?: string;
  /** 目标为 sold/settled 时的销售字段 */
  sale?: Partial<
    Pick<
      NewSale,
      | "sold_price"
      | "platform_fee"
      | "platform_subsidy"
      | "express_fee"
      | "other_fee"
      | "actual_payout"
      | "sold_at"
      | "settled_at"
    >
  >;
}

/**
 * 变更状态（任意状态直达）：
 * - 目标为 sold/settled：合并写入销售记录
 * - 目标为 refunded：保留售出事实，清空实际到账与结算日期（退款不计利润）
 * - 从 sold/settled/refunded 转到非销售状态：销售记录作废删除
 */
export async function changeUnitStatus(
  db: DbAdapter,
  unit: InventoryUnit,
  to: UnitStatus,
  opts: StatusChangeOptions = {},
): Promise<void> {
  if (to === unit.status) {
    throw new Error(`当前已是「${STATUS_META[to].label}」`);
  }

  const existing = (await db.listSales()).find((s) => s.unit_id === unit.id);

  if (to === "sold" || to === "settled") {
    await db.upsertSale({
      unit_id: unit.id,
      sold_price: opts.sale?.sold_price ?? existing?.sold_price ?? null,
      platform_fee: opts.sale?.platform_fee ?? existing?.platform_fee ?? 0,
      platform_subsidy:
        opts.sale?.platform_subsidy ?? existing?.platform_subsidy ?? 0,
      express_fee: opts.sale?.express_fee ?? existing?.express_fee ?? 0,
      other_fee: opts.sale?.other_fee ?? existing?.other_fee ?? 0,
      actual_payout:
        to === "settled"
          ? (opts.sale?.actual_payout ?? existing?.actual_payout ?? null)
          : (existing?.actual_payout ?? null),
      sold_at: opts.sale?.sold_at ?? existing?.sold_at ?? null,
      settled_at:
        to === "settled"
          ? (opts.sale?.settled_at ?? existing?.settled_at ?? null)
          : (existing?.settled_at ?? null),
    });
  } else if (to === "refunded") {
    // 退款：保留售价等售出事实，清除结算数据（不再计入利润）
    if (existing) {
      await db.upsertSale({ ...existing, actual_payout: null, settled_at: null });
    }
  } else if (SALE_STATUSES.includes(unit.status) || unit.status === "refunded") {
    // 离开销售相关状态（含退款回转在售等）：销售记录作废删除
    if (existing) await db.deleteSaleByUnit(unit.id);
  }

  await db.updateUnit(unit.id, { status: to });
  await db.addHistory([
    {
      unit_id: unit.id,
      from_status: unit.status,
      to_status: to,
      note: opts.note?.trim() || null,
    },
  ]);
}

/**
 * 回退到上一状态（按 status_history 最近一条的 from_status）。
 * 副作用：sold 回退到非销售态 → 删销售记录；settled 回退到 sold → 仅清结算数据。
 */
export async function revertUnitStatus(
  db: DbAdapter,
  unit: InventoryUnit,
  note?: string,
): Promise<UnitStatus> {
  const history = await db.listHistory(unit.id);
  const last = history[history.length - 1];
  if (!last || !last.from_status) {
    throw new Error("已是初始状态，无法回退");
  }
  const target = last.from_status;
  const historyNote = note?.trim() ? `回退：${note.trim()}` : "回退";

  if (SALE_STATUSES.includes(unit.status) || unit.status === "refunded") {
    if (target === "sold" || target === "settled") {
      // 回到销售态：清结算数据（回到已售），保留销售记录
      const sale = (await db.listSales()).find((s) => s.unit_id === unit.id);
      if (sale && unit.status === "settled") {
        await db.upsertSale({ ...sale, actual_payout: null, settled_at: null });
      }
    } else {
      await db.deleteSaleByUnit(unit.id);
    }
  }

  await db.updateUnit(unit.id, { status: target });
  await db.addHistory([
    { unit_id: unit.id, from_status: unit.status, to_status: target, note: historyNote },
  ]);
  return target;
}

export interface BatchResult {
  ok: number;
  failed: { id: string; message: string }[];
}

/** 批量变更状态（逐件执行，失败的收集返回） */
export async function batchChangeStatus(
  db: DbAdapter,
  units: InventoryUnit[],
  to: UnitStatus,
  opts: StatusChangeOptions = {},
): Promise<BatchResult> {
  const result: BatchResult = { ok: 0, failed: [] };
  for (const unit of units) {
    try {
      await changeUnitStatus(db, unit, to, opts);
      result.ok += 1;
    } catch (e) {
      result.failed.push({
        id: unit.id,
        message: e instanceof Error ? e.message : "操作失败",
      });
    }
  }
  return result;
}
