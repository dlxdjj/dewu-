// 同类合并分组：同产品、同尺码、同成本、同状态 → 一组
import type { UnitJoined } from "@/lib/types/database";
import type { UnitStatus } from "@/lib/constants/status";

export interface UnitGroup {
  key: string;
  product: UnitJoined["product"];
  size: string;
  unit_cost: number;
  status: UnitStatus;
  units: UnitJoined[];
}

export function groupKey(u: UnitJoined): string {
  return `${u.product_id}|${u.size}|${u.unit_cost}|${u.status}`;
}

export function buildGroups(units: UnitJoined[]): UnitGroup[] {
  const map = new Map<string, UnitGroup>();
  for (const u of units) {
    const key = groupKey(u);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        product: u.product,
        size: u.size,
        unit_cost: u.unit_cost,
        status: u.status,
        units: [],
      };
      map.set(key, g);
    }
    g.units.push(u);
  }
  return [...map.values()];
}

/** 组详情页 query 参数 */
export function groupQuery(g: UnitGroup): string {
  return [
    `product=${g.product.id}`,
    `size=${encodeURIComponent(g.size)}`,
    `cost=${g.unit_cost}`,
    `status=${g.status}`,
  ].join("&");
}
