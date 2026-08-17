"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeIcon, { type ThemeIconName } from "@/components/theme/ThemeIcon";
import { toAppPathname } from "@/lib/base-path";

const tabs = [
  { href: "/", label: "首页", icon: "home" },
  { href: "/inventory", label: "库存", icon: "inventory" },
  { href: "/add", label: "添加", icon: "add" },
  { href: "/reports", label: "报表", icon: "reports" },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: ThemeIconName }>;

export default function BottomNav() {
  const pathname = toAppPathname(usePathname());

  return (
    <nav
      aria-label="主导航"
      className="bottom-nav fixed inset-x-3 bottom-[calc(0.625rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-3xl"
    >
      <div className="bottom-nav-grid">
        {tabs.map(({ href, label, icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`bottom-nav-item ${active ? "is-active" : ""}`}
            >
              <ThemeIcon name={icon} size={24} active={active} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
