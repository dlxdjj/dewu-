const YUAN_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

/** Normalize decimal punctuation produced by Chinese iOS keyboards. */
export function normalizeMoneyInput(text: string): string {
  return text.replace(/[，,。]/g, ".");
}

/** Validate an integer amount represented in cents. */
export function assertCents(value: number, fieldName = "金额"): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${fieldName}必须是安全范围内的非负整数分`);
  }
}

/** Parse a non-negative yuan string without floating-point multiplication. */
export function parseYuanToCents(text: string): number {
  const normalized = normalizeMoneyInput(text.trim());
  const match = YUAN_PATTERN.exec(normalized);
  if (!match) throw new TypeError("金额格式不正确，最多保留两位小数");
  const yuan = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  if (!Number.isSafeInteger(yuan) || yuan > Math.floor(Number.MAX_SAFE_INTEGER / 100)) {
    throw new RangeError("金额超出安全范围");
  }
  const cents = yuan * 100 + Number(fraction || "0");
  assertCents(cents);
  return cents;
}

/** Format cents as a fixed two-decimal yuan string. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  assertCents(Math.abs(cents), "金额绝对值");
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}¥${Math.floor(absolute / 100).toLocaleString("zh-CN")}.${String(absolute % 100).padStart(2, "0")}`;
}

export function formatSignedCents(cents: number | null): string {
  if (cents == null) return "未结算";
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}
