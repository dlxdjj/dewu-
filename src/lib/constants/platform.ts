export const PLATFORMS = [
  { value: "taobao", label: "淘宝" },
  { value: "jd", label: "京东" },
  { value: "pdd", label: "拼多多" },
  { value: "vipshop", label: "唯品会" },
  { value: "other", label: "其他" },
] as const;

export type Platform = (typeof PLATFORMS)[number]["value"];

export const PLATFORM_LABELS: Record<Platform, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.value, p.label]),
) as Record<Platform, string>;
