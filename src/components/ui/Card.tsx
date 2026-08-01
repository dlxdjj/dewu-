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
      className={`rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${className}`}
    >
      {children}
    </div>
  );
}
