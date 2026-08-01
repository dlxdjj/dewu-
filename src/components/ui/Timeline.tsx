import { STATUS_META } from "@/lib/constants/status";
import { formatDateTime } from "@/lib/utils/format";
import type { StatusHistory } from "@/lib/types/database";

/** 状态变更时间轴 */
export default function Timeline({ history }: { history: StatusHistory[] }) {
  const items = [...history].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  if (items.length === 0) {
    return <p className="py-4 text-center text-[13px] text-muted">暂无状态记录</p>;
  }

  return (
    <ol className="relative ml-2 space-y-4 border-l border-separator pl-4">
      {items.map((h) => {
        const meta = STATUS_META[h.to_status];
        return (
          <li key={h.id} className="relative">
            <span
              className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            <p className="text-[14px] font-medium">
              {h.from_status
                ? `${STATUS_META[h.from_status].label} → ${meta.label}`
                : meta.label}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              {formatDateTime(h.created_at)}
              {h.note ? ` · ${h.note}` : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
