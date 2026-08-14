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
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-separator" />
        <h3 className="mb-3 text-center text-[16px] font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}
