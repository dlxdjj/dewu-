export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-5">
      <h1 className="text-[30px] font-bold leading-[1.08] tracking-[-0.035em]">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm leading-5 text-muted">{subtitle}</p>}
    </header>
  );
}
