const cny = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
});

/** 金额格式化，空值显示占位符 */
export function formatCny(n: number | null | undefined): string {
  return n == null ? "—" : cny.format(n);
}

/** 带符号金额（利润展示用），如 +¥120.50 / -¥30.00 */
export function formatSignedCny(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = cny.format(Math.abs(n));
  return n > 0 ? `+${abs}` : n < 0 ? `-${abs}` : abs;
}

/** 日期格式化为 2026/8/1 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 日期时间格式化为 2026/8/1 14:30 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(iso)} ${hh}:${mm}`;
}

/** 百分比格式化，0.125 → 12.5% */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

/** 今天日期 YYYY-MM-DD（本地时区） */
export function todayStr(): string {
  const d = new Date();
  return toDateStr(d);
}

export function toDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 月份键 YYYY-MM ↔ 展示文案 */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${Number(y)}年${Number(m)}月`;
}
