import type {
  InventorySort,
  InventoryView,
} from "@/lib/data/types";
import type { PlatformFilter, StatusFilter } from "@/lib/utils/group";

export interface InventoryReturnState {
  view: InventoryView;
  status: StatusFilter;
  platform: PlatformFilter;
  query: string;
  missingSizeOnly: boolean;
  sort: InventorySort;
  loaded: number;
}

export function inventoryReturnHref(state: InventoryReturnState): string {
  const params = new URLSearchParams();
  params.set("view", state.view);
  if (state.view === "active" && state.status !== "all") {
    params.set("status", state.status);
  }
  if (state.platform !== "all") params.set("platform", state.platform);
  if (state.query.trim()) params.set("q", state.query.trim());
  if (state.missingSizeOnly) params.set("missingSize", "1");
  if (state.sort !== "purchase_desc") params.set("sort", state.sort);
  if (state.loaded > 20) params.set("loaded", String(state.loaded));
  return `/inventory?${params.toString()}`;
}

export function safeInventoryHref(
  value: string | null | undefined,
  fallback = "/inventory?view=active",
): string {
  if (!value) return fallback;
  try {
    const url = new URL(value, "https://inventory.local");
    if (
      url.origin !== "https://inventory.local" ||
      !["/inventory", "/inventory/"].includes(url.pathname)
    ) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function safeInventoryDetailReturn(
  value: string | null | undefined,
): string {
  if (!value) return "/inventory?view=active";
  try {
    const url = new URL(value, "https://inventory.local");
    if (url.origin !== "https://inventory.local") return "/inventory?view=active";
    if (!["/inventory", "/inventory/", "/inventory/group", "/inventory/group/"].includes(url.pathname)) {
      return "/inventory?view=active";
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return "/inventory?view=active";
  }
}

export function inventoryReturnLabel(href: string): string {
  const url = new URL(href, "https://inventory.local");
  switch (url.searchParams.get("view")) {
    case "settlement": return "待结算";
    case "sales": return "销售记录";
    case "refunds": return "退货退款";
    default: return "库存";
  }
}

export function inventoryScrollKey(href: string): string {
  return `pms_inventory_scroll:${href}`;
}
