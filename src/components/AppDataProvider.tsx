"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getDb } from "@/lib/data";
import { supportsRebateIncome } from "@/lib/account-features";
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
      const preferencesPromise = db.getAccountPreferences();
      const unitsPromise = db.listUnits();
      const productsPromise = db.listProducts();
      const batchesPromise = db.listBatches();
      const salesPromise = db.listSales();
      const shippingEventsPromise = db.listShippingEvents();
      const shippingEventItemsPromise = db.listShippingEventItems();
      const preferences = await preferencesPromise;
      const [units, products, batches, sales, rebates, shippingEvents, shippingEventItems] = await Promise.all([
        unitsPromise,
        productsPromise,
        batchesPromise,
        salesPromise,
        supportsRebateIncome(preferences.workflow) ? db.listRebates() : Promise.resolve([]),
        shippingEventsPromise,
        shippingEventItemsPromise,
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
