"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Bottom sheet with dialog semantics, focus trapping, and keyboard recovery. */
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
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const background = [
      document.querySelector(".app-main"),
      document.querySelector('nav[aria-label="主导航"]'),
    ].filter((item): item is HTMLElement => item instanceof HTMLElement);
    const previousOverflow = document.body.style.overflow;
    for (const item of background) item.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    queueMicrotask(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? dialogRef.current)?.focus();
    });
    return () => {
      for (const item of background) item.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  function trapFocus(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      .filter((item) => !item.hasAttribute("disabled"));
    if (!items.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = items[0];
    const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        tabIndex={-1}
        aria-label="关闭弹窗"
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="relative max-h-[88dvh] w-[calc(100%_-_1rem)] max-w-lg overflow-y-auto rounded-t-[28px] border border-b-0 border-separator bg-card px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-[var(--cirrus-shadow-2)] outline-none"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-separator" aria-hidden="true" />
        <div className="mb-4 grid grid-cols-[44px_1fr_44px] items-center">
          <span aria-hidden="true" />
          <h2 id={titleId} className="text-center text-[18px] font-semibold tracking-[-0.02em]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 text-sm text-tint"
          >
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
