import type { ReactNode } from "react";

/** 表单字段包装：标签 + 控件 */
export default function Field({
  label,
  children,
  optional,
}: {
  label: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1 text-[13px] text-muted">
        {label}
        {optional && <span className="text-[11px]">（选填）</span>}
      </span>
      {children}
    </label>
  );
}

/** 统一输入框样式（16px 字号避免 iOS 聚焦自动放大） */
export const inputCls =
  "w-full rounded-xl bg-background px-3 py-2.5 text-[16px] outline-none placeholder:text-muted focus:ring-2 focus:ring-tint/40";

/** 金额输入框：调起手机数字键盘 */
export const moneyInputProps = {
  inputMode: "decimal" as const,
  pattern: "[0-9.]*",
  type: "text" as const,
};
