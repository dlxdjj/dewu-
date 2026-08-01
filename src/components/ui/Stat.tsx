import Card from "./Card";

export default function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-[24px] font-semibold leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}
