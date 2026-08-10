export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4">
      <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm leading-5 text-muted">{subtitle}</p>}
    </header>
  );
}
