export const REBATE_SOURCES = ["taobao_alliance", "jingfen"] as const;

export type RebateSource = (typeof REBATE_SOURCES)[number];

export const REBATE_SOURCE_LABELS: Record<RebateSource, string> = {
  taobao_alliance: "淘宝联盟",
  jingfen: "京粉",
};
