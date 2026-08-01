"use client";

import Link from "next/link";
import StatusBadge from "./StatusBadge";
import { BoxIcon } from "./icons";
import { PLATFORM_LABELS } from "@/lib/constants/platform";
import { formatCny, formatSignedCny } from "@/lib/utils/format";
import { profitColor } from "@/lib/utils/profit";
import { groupQuery, type UnitGroup } from "@/lib/utils/group";

/** 合并组卡片：同类（同产品/尺码/成本/状态）N 件合并显示 */
export default function GroupCard({
  group,
  imageUrl,
  profitSum,
  maxDays,
}: {
  group: UnitGroup;
  imageUrl: string | null;
  profitSum: number | null;
  maxDays: number;
}) {
  return (
    <Link
      href={`/inventory/group?${groupQuery(group)}`}
      className="flex gap-3 rounded-2xl bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-background"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background text-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={group.product.name} className="h-full w-full object-cover" />
        ) : (
          <BoxIcon size={24} strokeWidth={1.4} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-medium">{group.product.name}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-label px-2 py-0.5 text-[11px] font-semibold text-card">
              ×{group.units.length}
            </span>
            <StatusBadge status={group.status} />
          </div>
        </div>
        <p className="mt-0.5 text-[12px] text-muted">
          {group.product.style_code || "无货号"} · {group.size} ·{" "}
          {PLATFORM_LABELS[group.units[0].batch.platform]}
        </p>
        <div className="mt-1.5 flex items-baseline justify-between">
          <p className="text-[12px] text-muted">
            成本 {formatCny(group.unit_cost)} · 最长 {maxDays} 天
          </p>
          <p className="text-[14px] font-semibold" style={{ color: profitColor(profitSum) }}>
            {profitSum != null ? (
              <>
                <span className="mr-0.5 text-[10px] font-normal">计</span>
                {formatSignedCny(profitSum)}
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}
