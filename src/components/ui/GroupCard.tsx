"use client";

import Link from "next/link";
import { PLATFORM_LABELS } from "@/lib/constants/platform";
import { STATUS_META, UNIT_STATUSES } from "@/lib/constants/status";
import { formatCents } from "@/lib/utils/money";
import {
  groupQuery,
  type PlatformFilter,
  type GroupSelection,
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
  onSettle,
  statusScope,
  showPlatform = true,
}: {
  group: UnitGroup;
  imageUrl: string | null;
  platformFilter: PlatformFilter;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onSettle?: (units: UnitGroup["units"]) => void;
  statusScope?: GroupSelection["scope"];
  showPlatform?: boolean;
}) {
  const statuses = UNIT_STATUSES.flatMap((status) => {
    const count = group.statusCounts[status] ?? 0;
    return count ? [{ count, status }] : [];
  });
  const platformText = group.platforms
    .map((platform) => PLATFORM_LABELS[platform])
    .join(" · ");
  const settlementUnits = group.units.filter((unit) => unit.status === "sold");
  const className = `inventory-product-card flex min-w-0 w-full max-w-full gap-3 overflow-hidden rounded-[28px] border border-separator bg-card p-4 text-left shadow-[var(--cirrus-shadow-1)] active:bg-background ${
    selected ? "ring-2 ring-tint" : ""
  }`;

  const content = (
    <>
      <div className="inventory-product-image flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-background text-muted">
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
        <div className="inventory-product-title flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-base font-semibold leading-6">
            {group.product.name}
          </p>
          <span className="inventory-product-count shrink-0 rounded-full bg-label px-2.5 py-1 text-sm font-semibold text-card shadow-[var(--cirrus-shadow-2)]">
            ×{group.units.length}
          </span>
        </div>
        <p className="inventory-product-code mt-0.5 truncate text-sm leading-5 text-muted">
          {group.styleCode || "历史无货号"} · {group.size || "待补尺码"}
        </p>
        {showPlatform && (
          <p className="inventory-product-platform mt-0.5 text-sm leading-5 text-muted">{platformText}</p>
        )}
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <div className="inventory-statuses flex min-w-0 flex-wrap gap-1.5" aria-label="库存状态">
            {statuses.map(({ count, status }) => {
              const meta = STATUS_META[status];
              return (
                <span
                  key={status}
                    className="inventory-status inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-sm leading-5 text-label"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  {meta.label} {count}
                </span>
              );
            })}
          </div>
          <p className="inventory-product-cost ml-auto shrink-0 text-sm font-semibold leading-5">
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
        aria-label={`选择 ${group.styleCode || group.product.name} ${group.size || "待补尺码"}，共 ${group.units.length} 件`}
        aria-pressed={selected}
        onClick={onToggle}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <article className="inventory-product-card min-w-0 overflow-hidden rounded-[28px] border border-separator bg-card shadow-[var(--cirrus-shadow-1)]">
      <Link
        href={`/inventory/group?${groupQuery(group, platformFilter, statusScope)}`}
        className="inventory-product-card-main flex min-w-0 w-full max-w-full gap-3 overflow-hidden p-4 text-left active:bg-background"
      >
        {content}
      </Link>
      {settlementUnits.length > 0 && onSettle && (
        <div className="border-t border-separator px-3 py-2.5">
          <button
            type="button"
            onClick={() => onSettle(settlementUnits)}
            className="min-h-11 w-full rounded-full bg-label px-3 text-[15px] font-medium text-card"
          >
            录到手价 · {settlementUnits.length} 件待结算
          </button>
        </div>
      )}
    </article>
  );
}
