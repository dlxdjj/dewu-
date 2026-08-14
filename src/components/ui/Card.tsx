import type { ReactNode } from "react";

export default function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] border border-separator bg-card p-5 shadow-[var(--cirrus-shadow-1)] ${className}`}
    >
      {children}
    </div>
  );
}
