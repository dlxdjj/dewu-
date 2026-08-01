"use client";

import { STATUS_META, UNIT_STATUSES, type UnitStatus } from "@/lib/constants/status";

/** 状态直达选择器：当前状态高亮，点其他状态直接变更 */
export default function StatusChips({
  current,
  onSelect,
}: {
  current: UnitStatus;
  onSelect: (to: UnitStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {UNIT_STATUSES.map((s) => {
        const meta = STATUS_META[s];
        const active = s === current;
        return (
          <button
            key={s}
            type="button"
            disabled={active}
            onClick={() => onSelect(s)}
            className={`rounded-full px-3.5 py-2 text-[13px] ${
              active
                ? "font-semibold text-white"
                : "bg-card text-label shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-background"
            }`}
            style={active ? { backgroundColor: meta.color } : undefined}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
