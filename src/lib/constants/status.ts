// 单件库存状态：8 个状态，任意状态可直接互转（状态直达，无流程约束）

export const UNIT_STATUSES = [
  "pending", // 未到货
  "arrived", // 已到货
  "shipping", // 发往得物途中
  "in_stock_dewu", // 已到得物仓未售出
  "sold", // 已售出待结算
  "settled", // 已结算
  "returned", // 退回
  "refunded", // 退款
] as const;

export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const STATUS_META: Record<UnitStatus, { label: string; color: string }> = {
  pending: { label: "未到货", color: "#FF9500" },
  arrived: { label: "已到货", color: "#0A84FF" },
  shipping: { label: "发往得物途中", color: "#FF9500" },
  in_stock_dewu: { label: "得物仓未售", color: "#AF52DE" },
  sold: { label: "已售待结算", color: "#FF9F0A" },
  settled: { label: "已结算", color: "#34C759" },
  returned: { label: "退回", color: "#FF3B30" },
  refunded: { label: "退款", color: "#8E8E93" },
};

/** 状态直达：除自身外任意状态可互转 */
export function canTransition(from: UnitStatus, to: UnitStatus): boolean {
  return from !== to && UNIT_STATUSES.includes(to);
}

/** 销售相关状态（持有销售记录的状态） */
export const SALE_STATUSES: UnitStatus[] = ["sold", "settled"];

/** 仍在库、占用资金的状态 */
export const ACTIVE_STATUSES: UnitStatus[] = [
  "pending",
  "arrived",
  "shipping",
  "in_stock_dewu",
  "returned",
];

/** 库存页筛选分组 */
export const STATUS_FILTER_GROUPS: { label: string; statuses: UnitStatus[] }[] = [
  { label: "未到货", statuses: ["pending"] },
  { label: "现货", statuses: ["arrived"] },
  { label: "发往得物", statuses: ["shipping"] },
  { label: "得物仓未售", statuses: ["in_stock_dewu"] },
  { label: "已售", statuses: ["sold", "settled"] },
  { label: "退回/退款", statuses: ["returned", "refunded"] },
];

/** 滞留提醒规则（首页待办用） */
export const STALE_RULES: { status: UnitStatus; days: number; hint: string }[] = [
  { status: "pending", days: 10, hint: "采购超 10 天未到货" },
  { status: "shipping", days: 5, hint: "在途超 5 天，确认得物是否签收" },
  { status: "in_stock_dewu", days: 14, hint: "在仓超 14 天，考虑调价" },
];
