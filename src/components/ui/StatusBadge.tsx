import { STATUS_META, type UnitStatus } from "@/lib/constants/status";

export default function StatusBadge({ status }: { status: UnitStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: meta.color, backgroundColor: `${meta.color}1A` }}
    >
      {meta.label}
    </span>
  );
}
