"use client";

import type { ReactNode } from "react";

/** 底部弹出表单（iOS 风格 action sheet） */
export default function Sheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative max-h-[88dvh] w-[calc(100%_-_1rem)] max-w-lg overflow-y-auto rounded-t-[28px] border border-b-0 border-separator bg-card px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-[var(--cirrus-shadow-2)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-separator" />
        <h3 className="mb-4 text-center text-[18px] font-semibold tracking-[-0.02em]">{title}</h3>
        {children}
      </div>
    </div>
  );
}
