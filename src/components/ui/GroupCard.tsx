"use client";

import Link from "next/link";
import { PLATFORM_LABELS } from "@/lib/constants/platform";
import { STATUS_META, UNIT_STATUSES } from "@/lib/constants/status";
import { formatCents } from "@/lib/utils/money";
import {
  groupQuery,
  type PlatformFilter,
  type UnitGroup,
} from "@/lib/utils/group";
import { BoxIcon } from "./icons";

export default function GroupCard({
  group,
  imageUrl,
  platformFilter,
  selectable,
  selected,
  onToggle,
}: {
  group: UnitGroup;
  imageUrl: string | null;
  platformFilter: PlatformFilter;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const statusText = UNIT_STATUSES.flatMap((status) => {
    const count = group.statusCounts[status] ?? 0;
    return count ? [`${STATUS_META[status].label} ${count}`] : [];
  }).join(" · ");
  const platformText = group.platforms
    .map((platform) => PLATFORM_LABELS[platform])
    .join(" · ");
  const className = `flex w-full gap-3 rounded-2xl bg-card p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-background ${
    selected ? "ring-2 ring-tint" : ""
  }`;

  const content = (
    <>
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background text-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={group.product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <BoxIcon size={24} strokeWidth={1.4} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-medium">
            {group.product.name}
          </p>
          <span className="shrink-0 rounded-full bg-label px-2 py-0.5 text-[11px] font-semibold text-card">
            ×{group.units.length}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-muted">
          {group.styleCode || "历史无货号"} · {group.size}
        </p>
        <p className="mt-1 text-[12px] text-muted">{platformText}</p>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <p className="min-w-0 text-[11px] text-muted">{statusText}</p>
          <p className="shrink-0 text-[12px] font-medium">
            成本合计 {formatCents(group.totalCostCents)}
          </p>
        </div>
      </div>
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        aria-label={`选择 ${group.styleCode || group.product.name} ${group.size}，共 ${group.units.length} 件`}
        aria-pressed={selected}
        onClick={onToggle}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={`/inventory/group?${groupQuery(group, platformFilter)}`}
      className={className}
    >
      {content}
    </Link>
  );
}
