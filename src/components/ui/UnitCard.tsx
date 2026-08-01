"use client";

import Link from "next/link";
import StatusBadge from "./StatusBadge";
import { BoxIcon } from "./icons";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants/platform";
import { formatCny, formatSignedCny } from "@/lib/utils/format";
import { profitColor, type ProfitResult } from "@/lib/utils/profit";
import type { UnitJoined } from "@/lib/types/database";

/** 库存卡片：只显示规格要求的字段；支持批量选择模式 */
export default function UnitCard({
  unit,
  imageUrl,
  profit,
  statusDays,
  selectable = false,
  selected = false,
  onToggle,
}: {
  unit: UnitJoined;
  imageUrl: string | null;
  profit: ProfitResult;
  statusDays: number;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      {/* 选择圈 */}
      {selectable && (
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
            selected ? "border-tint bg-tint text-white" : "border-separator bg-card"
          }`}
        >
          {selected && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m4.5 12.5 5 5 10-11" />
            </svg>
          )}
        </span>
      )}

      {/* 商品图片 */}
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background text-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={unit.product.name} className="h-full w-full object-cover" />
        ) : (
          <BoxIcon size={24} strokeWidth={1.4} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-medium">{unit.product.name}</p>
          <StatusBadge status={unit.status} />
        </div>
        <p className="mt-0.5 text-[12px] text-muted">
          {unit.product.style_code || "无货号"} · {unit.size} ·{" "}
          {PLATFORM_LABELS[unit.batch.platform as Platform] ?? unit.batch.platform}
        </p>
        <div className="mt-1.5 flex items-baseline justify-between">
          <p className="text-[12px] text-muted">
            成本 {formatCny(unit.unit_cost)} · 状态 {statusDays} 天
          </p>
          <p
            className="text-[14px] font-semibold"
            style={{ color: profitColor(profit.value) }}
          >
            {profit.value != null && (
              <span className="mr-0.5 text-[10px] font-normal">
                {profit.kind === "actual" ? "实" : "预"}
              </span>
            )}
            {profit.value != null ? formatSignedCny(profit.value) : "—"}
          </p>
        </div>
      </div>
    </>
  );

  const cls = `flex items-center gap-3 rounded-2xl bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-background ${
    selected ? "ring-2 ring-tint" : ""
  }`;

  if (selectable) {
    return (
      <button type="button" onClick={onToggle} className={`${cls} w-full text-left`}>
        {body}
      </button>
    );
  }
  return (
    <Link href={`/inventory/${unit.id}`} className={cls}>
      {body}
    </Link>
  );
}
