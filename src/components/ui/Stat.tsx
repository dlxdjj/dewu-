import Card from "./Card";

export default function Stat({
  label,
  value,
  hint,
  compact = false,
  featured = false,
}: {
  label: string;
  value: string;
  hint?: string;
  compact?: boolean;
  featured?: boolean;
}) {
  const compactValueSize =
    value.length >= 11
      ? "text-[clamp(13px,3.5vw,18px)]"
      : value.length >= 9
        ? "text-[clamp(15px,4.1vw,21px)]"
        : "text-[clamp(18px,5vw,24px)]";

  return (
    <Card
      className={`${featured ? "bg-label text-card" : ""} ${
        compact
          ? "min-w-0 overflow-hidden px-3 py-4 text-center"
          : "min-w-0 overflow-hidden"
      }`}
    >
      <p className={`truncate text-[13px] ${featured ? "text-card/70" : "text-muted"}`}>{label}</p>
      <p
        className={`mt-1 whitespace-nowrap font-semibold leading-none tabular-nums ${
          compact
            ? `${compactValueSize} tracking-[-0.035em]`
            : "text-[24px]"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className={`mt-1.5 truncate text-[11px] ${featured ? "text-card/70" : "text-muted"}`}>{hint}</p>
      )}
    </Card>
  );
}
