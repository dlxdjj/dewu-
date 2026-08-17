import type { ComponentType } from "react";
import {
  Bell,
  ChartNoAxesColumnIncreasing,
  House,
  Package,
  PlusSquare,
  Settings,
} from "lucide-react";
import {
  ChartBar,
  Gear,
  House as PixelHouse,
  Package as PixelPackage,
  PlusSquare as PixelPlusSquare,
} from "@phosphor-icons/react";
import {
  IconBell,
  IconChartBar,
  IconHome,
  IconPackage,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";

export type ThemeIconName = "home" | "inventory" | "add" | "reports" | "settings" | "bell";

type IconComponent = ComponentType<{
  size?: number | string;
  strokeWidth?: number;
  weight?: "regular" | "bold";
  "aria-hidden"?: boolean;
}>;

const lucideIcons: Record<ThemeIconName, IconComponent> = {
  home: House,
  inventory: Package,
  add: PlusSquare,
  reports: ChartNoAxesColumnIncreasing,
  settings: Settings,
  bell: Bell,
};

const pixelIcons: Record<ThemeIconName, IconComponent> = {
  home: PixelHouse as IconComponent,
  inventory: PixelPackage as IconComponent,
  add: PixelPlusSquare as IconComponent,
  reports: ChartBar as IconComponent,
  settings: Gear as IconComponent,
  bell: Bell,
};

const volturaIcons: Record<ThemeIconName, IconComponent> = {
  home: IconHome,
  inventory: IconPackage,
  add: IconPlus,
  reports: IconChartBar,
  settings: IconSettings,
  bell: IconBell,
};

export default function ThemeIcon({
  name,
  size = 22,
  active = false,
}: {
  name: ThemeIconName;
  size?: number;
  active?: boolean;
}) {
  const LucideIcon = lucideIcons[name];
  const PixelIcon = pixelIcons[name];
  const VolturaIcon = volturaIcons[name];

  return (
    <span className="theme-icon" aria-hidden="true">
      <LucideIcon
        aria-hidden
        size={size}
        strokeWidth={active ? 2.15 : 1.65}
        data-icon-family="line"
      />
      <PixelIcon
        aria-hidden
        size={size}
        weight={active ? "bold" : "regular"}
        data-icon-family="pixel"
      />
      <VolturaIcon
        aria-hidden
        size={size}
        strokeWidth={active ? 2 : 1.5}
        data-icon-family="voltura"
      />
    </span>
  );
}
