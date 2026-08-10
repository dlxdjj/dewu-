"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HouseIcon,
  BoxIcon,
  PlusCircleIcon,
  ChartIcon,
  GearIcon,
} from "@/components/ui/icons";
import { toAppPathname } from "@/lib/base-path";

const tabs = [
  { href: "/", label: "首页", Icon: HouseIcon },
  { href: "/inventory", label: "库存", Icon: BoxIcon },
  { href: "/add", label: "添加", Icon: PlusCircleIcon },
  { href: "/reports", label: "报表", Icon: ChartIcon },
  { href: "/settings", label: "设置", Icon: GearIcon },
] as const;

export default function BottomNav() {
  const pathname = toAppPathname(usePathname());

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-separator bg-card/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl items-stretch px-4 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                active ? "text-tint" : "text-muted"
              }`}
            >
              <Icon size={25} strokeWidth={active ? 2 : 1.6} />
              <span className="text-xs leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
