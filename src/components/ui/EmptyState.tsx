import type { ReactNode } from "react";

export default function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="text-[15px] font-medium">{title}</p>
      {subtitle && (
        <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-muted">
          {subtitle}
        </p>
      )}
    </div>
  );
}
