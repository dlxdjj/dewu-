"use client";

import { useEffect, useSyncExternalStore } from "react";
import HomePage from "@/app/page";
import InventoryPage from "@/app/inventory/page";
import ReportsPage from "@/app/reports/page";
import PurchaseForm from "@/components/add/PurchaseForm";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { isAppTheme, saveTheme } from "@/lib/theme";
import { makeInventorySeed } from "@/test/inventory-fixtures";

type PreviewScreen = "home" | "inventory" | "add" | "reports";

const previewDb = new MemoryDbAdapter({
  ...makeInventorySeed(),
  rebates: [
    {
      id: "rebate-preview",
      user_id: "preview",
      month: "2026-08-01",
      source: "taobao_alliance",
      amount_cents: 28600,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    },
  ],
});

const subscribeToLocation = () => () => undefined;

export default function ThemeQaClient() {
  const search = useSyncExternalStore(
    subscribeToLocation,
    () => window.location.search,
    () => null,
  );
  const params = new URLSearchParams(search ?? "");
  const requestedScreen = params.get("screen");
  const requestedTheme = params.get("theme");
  const screen: PreviewScreen = ["home", "inventory", "add", "reports"].includes(requestedScreen ?? "")
    ? requestedScreen as PreviewScreen
    : "home";
  const theme = isAppTheme(requestedTheme) ? requestedTheme : "cirrus";

  useEffect(() => {
    if (search !== null) saveTheme(theme);
  }, [search, theme]);

  if (search === null) return null;

  if (screen === "inventory") return <InventoryPage dataSource={previewDb} />;
  if (screen === "add") return <PurchaseForm dataSource={previewDb} onComplete={() => undefined} />;
  if (screen === "reports") return <ReportsPage dataSource={previewDb} initialMonth="2026-08" />;
  return <HomePage dataSource={previewDb} now={new Date("2026-08-17T12:00:00+08:00")} />;
}
