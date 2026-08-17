"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getDb } from "@/lib/data";
import { toAppPathname } from "@/lib/base-path";
import type {
  AccountPreferences,
  InventoryUnit,
  MonthlyRebate,
  Product,
  PurchaseBatch,
  Sale,
  ShippingEvent,
  ShippingEventItem,
} from "@/lib/types/database";

export interface AppDataSnapshot {
  preferences: AccountPreferences;
  units: InventoryUnit[];
  products: Product[];
  batches: PurchaseBatch[];
  sales: Sale[];
  rebates: MonthlyRebate[];
  shippingEvents: ShippingEvent[];
  shippingEventItems: ShippingEventItem[];
}

interface AppDataContextValue {
  data: AppDataSnapshot | null;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export default function AppDataProvider({ children }: { children: React.ReactNode }) {
  const pathname = toAppPathname(usePathname());
  const shouldLoad = pathname !== "/login";
  const [data, setData] = useState<AppDataSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const db = getDb();
      const [preferences, units, products, batches, sales, rebates, shippingEvents, shippingEventItems] = await Promise.all([
        db.getAccountPreferences(),
        db.listUnits(), db.listProducts(), db.listBatches(), db.listSales(),
        db.listRebates(), db.listShippingEvents(), db.listShippingEventItems(),
      ]);
      setData({ preferences, units, products, batches, sales, rebates, shippingEvents, shippingEventItems });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    void Promise.resolve().then(refresh);
  }, [refresh, shouldLoad]);

  useEffect(() => {
    const reload = () => void refresh();
    window.addEventListener("pms:data-mutated", reload);
    return () => window.removeEventListener("pms:data-mutated", reload);
  }, [refresh]);

  const value = useMemo(() => ({ data, error, loading, refresh }), [data, error, loading, refresh]);
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue | null {
  return useContext(AppDataContext);
}
