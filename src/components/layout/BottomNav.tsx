"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HouseIcon,
  BoxIcon,
  PlusCircleIcon,
  ChartIcon,
} from "@/components/ui/icons";
import { toAppPathname } from "@/lib/base-path";

const tabs = [
  { href: "/", label: "首页", Icon: HouseIcon },
  { href: "/inventory", label: "库存", Icon: BoxIcon },
  { href: "/add", label: "添加", Icon: PlusCircleIcon },
  { href: "/reports", label: "报表", Icon: ChartIcon },
  { href: "/settings", label: "设置", Icon: ChartIcon },
] as const;

export default function BottomNav() {
  const pathname = toAppPathname(usePathname());

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-separator bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch px-4 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 pb-1 pt-1.5 transition-colors ${
                active ? "text-tint" : "text-muted"
              }`}
            >
              <Icon size={25} strokeWidth={active ? 2 : 1.6} />
              <span className="text-[10px] leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
