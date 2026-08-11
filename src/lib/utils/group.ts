import { normalizeStyleCode } from "@/lib/catalog";
import {
  PLATFORMS,
  type Platform,
} from "@/lib/constants/platform";
import type { UnitStatus } from "@/lib/constants/status";
import type { UnitJoined } from "@/lib/types/database";

export type PlatformFilter = Platform | "all";
export type StatusFilter = UnitStatus | "all";

export interface UnitGroup {
  key: string;
  product: UnitJoined["product"];
  styleCode: string | null;
  size: string;
  totalCostCents: number;
  platforms: Platform[];
  statusCounts: Partial<Record<UnitStatus, number>>;
  units: UnitJoined[];
}

export interface GroupSelection {
  styleCode: string | null;
  productId: string | null;
  size: string;
  platform: Platform | null;
}

function normalizeSize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function identity(unit: UnitJoined): string {
  return (
    normalizeStyleCode(unit.product.style_code) ||
    `legacy-product:${unit.product_id}`
  );
}

export function groupKey(unit: UnitJoined): string {
  return `${identity(unit)}|${normalizeSize(unit.size)}`;
}

export function filterUnitsByPlatform(
  units: UnitJoined[],
  filter: PlatformFilter,
): UnitJoined[] {
  return filter === "all"
    ? units
    : units.filter((unit) => unit.batch.platform === filter);
}

export function filterUnitsByStatus(
  units: UnitJoined[],
  filter: StatusFilter,
): UnitJoined[] {
  return filter === "all"
    ? units
    : units.filter((unit) => unit.status === filter);
}

export function buildGroups(units: UnitJoined[]): UnitGroup[] {
  const map = new Map<string, UnitGroup>();
  for (const unit of units) {
    const key = groupKey(unit);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        product: unit.product,
        styleCode: unit.product.style_code?.trim() || null,
        size: unit.size.trim(),
        totalCostCents: 0,
        platforms: [],
        statusCounts: {},
        units: [],
      };
      map.set(key, group);
    }
    group.units.push(unit);
    group.totalCostCents += unit.unit_cost_cents;
    if (!group.platforms.includes(unit.batch.platform)) {
      group.platforms.push(unit.batch.platform);
      group.platforms.sort(
        (left, right) =>
          PLATFORMS.findIndex((item) => item.value === left) -
          PLATFORMS.findIndex((item) => item.value === right),
      );
    }
    group.statusCounts[unit.status] =
      (group.statusCounts[unit.status] ?? 0) + 1;
  }
  return [...map.values()];
}

export function groupQuery(
  group: UnitGroup,
  platform: PlatformFilter,
): string {
  const params = new URLSearchParams();
  if (group.styleCode) params.set("style", group.styleCode);
  else params.set("product", group.product.id);
  params.set("size", group.size);
  if (platform !== "all") params.set("platform", platform);
  return params.toString();
}

export function matchesGroup(
  unit: UnitJoined,
  selection: GroupSelection,
): boolean {
  if (normalizeSize(unit.size) !== normalizeSize(selection.size)) return false;
  if (
    selection.platform &&
    unit.batch.platform !== selection.platform
  ) {
    return false;
  }
  if (selection.styleCode) {
    return (
      normalizeStyleCode(unit.product.style_code) ===
      normalizeStyleCode(selection.styleCode)
    );
  }
  return Boolean(
    selection.productId && unit.product_id === selection.productId,
  );
}
