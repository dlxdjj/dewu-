import { STATUS_META, type UnitStatus } from "@/lib/constants/status";

export default function StatusBadge({ status }: { status: UnitStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-separator bg-card px-2.5 py-1 text-xs font-medium shadow-[var(--cirrus-shadow-1)]"
      style={{ color: meta.color }}
    >
      {meta.label}
    </span>
  );
}
