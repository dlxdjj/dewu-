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

/** 新采购不能直接进入需要运费、销售数据或退款确认的状态。 */
export const PURCHASE_INITIAL_STATUSES = [
  "pending",
  "arrived",
  "in_stock_dewu",
  "returned",
] as const satisfies readonly UnitStatus[];

/** 批量普通状态变更；寄出、结算和退款必须走专用表单/RPC。 */
export const BATCH_STATUS_TARGETS = [
  "pending",
  "arrived",
  "shipping",
  "in_stock_dewu",
  "sold",
  "returned",
] as const satisfies readonly UnitStatus[];

export const STATUS_META: Record<UnitStatus, { label: string; color: string }> = {
  pending: { label: "未到货", color: "#9A5700" },
  arrived: { label: "已到货", color: "#0067C0" },
  shipping: { label: "发往得物途中", color: "#9A5700" },
  in_stock_dewu: { label: "得物仓未售", color: "#7B2CBF" },
  sold: { label: "已售待结算", color: "#9A5700" },
  settled: { label: "已结算", color: "#1B7F37" },
  returned: { label: "退回待处理", color: "#D70015" },
  refunded: { label: "退货退款", color: "#636366" },
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

/** 库存页按精确状态筛选，避免把待结算和已结算混在一起。 */
export const STATUS_FILTER_OPTIONS = UNIT_STATUSES.map((status) => ({
  status,
  label: STATUS_META[status].label,
}));

/** 滞留提醒规则（首页待办用） */
export const STALE_RULES: { status: UnitStatus; days: number; hint: string }[] = [
  { status: "pending", days: 10, hint: "采购超 10 天未到货" },
  { status: "shipping", days: 5, hint: "在途超 5 天，确认得物是否签收" },
  { status: "in_stock_dewu", days: 14, hint: "在仓超 14 天，考虑调价" },
];
