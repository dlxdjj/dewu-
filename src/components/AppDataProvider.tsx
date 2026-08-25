"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getDb } from "@/lib/data";
import { toAppPathname } from "@/lib/base-path";
import { onAuthSessionChange } from "@/lib/supabase/auth";
import type {
  AccountPreferences,
  InventoryUnit,
  MonthlyRebate,
  Product,
  PurchaseBatch,
  Sale,
  ShippingEvent,
  ShippingEventItem,
  AccountWorkflow,
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
  const [loadingWorkflow, setLoadingWorkflow] = useState<AccountWorkflow | null>(null);
  const activeUserId = useRef<string | null>(null);
  const loadVersion = useRef(0);
  const welcomedUsers = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    setError("");
    setLoading(true);
    try {
      const db = getDb();
      const preferences = await db.getAccountPreferences();
      if (version !== loadVersion.current) return;
      setLoadingWorkflow(preferences.workflow);
      if (
        preferences.workflow === "bulk" &&
        preferences.user_id &&
        !welcomedUsers.current.has(preferences.user_id)
      ) {
        welcomedUsers.current.add(preferences.user_id);
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        if (version !== loadVersion.current) return;
      }
      activeUserId.current = preferences.user_id || null;
      // Route-level server queries own the large datasets. Keeping only account
      // preferences here prevents every page from downloading the full ledger.
      setData({
        preferences,
        units: [],
        products: [],
        batches: [],
        sales: [],
        rebates: [],
        shippingEvents: [],
        shippingEventItems: [],
      });
    } catch (reason) {
      if (version !== loadVersion.current) return;
      setError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      if (version === loadVersion.current) setLoading(false);
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

  useEffect(() => onAuthSessionChange((_event, session) => {
    const nextUserId = session?.user.id ?? null;
    if (nextUserId === activeUserId.current) return;
    loadVersion.current += 1;
    activeUserId.current = nextUserId;
    setData(null);
    setError("");
    setLoadingWorkflow(null);
    setLoading(Boolean(nextUserId && shouldLoad));
    if (nextUserId && shouldLoad) void refresh();
  }), [refresh, shouldLoad]);

  const value = useMemo(() => ({ data, error, loading, refresh }), [data, error, loading, refresh]);
  const showFriendWelcome = shouldLoad && loading && !data && loadingWorkflow === "bulk";

  return (
    <AppDataContext.Provider value={value}>
      {showFriendWelcome ? <FriendAccountWelcome /> : children}
    </AppDataContext.Provider>
  );
}

function FriendAccountWelcome() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="friend-welcome-screen fixed inset-0 z-[100] flex min-h-dvh items-center justify-center px-6 text-center"
    >
      <div className="-translate-y-6">
        <p className="text-sm font-medium tracking-[0.22em] text-tint">WELCOME</p>
        <h1 className="mt-4 text-[32px] font-bold leading-tight">欢迎孙老板</h1>
        <p className="mt-3 text-lg leading-7 text-muted">孙老板发大财</p>
      </div>
    </div>
  );
}

export function useAppData(): AppDataContextValue | null {
  return useContext(AppDataContext);
}
