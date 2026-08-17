"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import { useAppData } from "@/components/AppDataProvider";
import { supportsRebateIncome } from "@/lib/account-features";
import { getDb } from "@/lib/data";
import {
  buildHomeSummary,
  type HomeSummary,
} from "@/lib/home-summary";
import { formatCents } from "@/lib/utils/money";

interface HomeDataSource {
  getAccountPreferences: ReturnType<typeof getDb>["getAccountPreferences"];
  listSales: ReturnType<typeof getDb>["listSales"];
  listUnits: ReturnType<typeof getDb>["listUnits"];
  listRebates: ReturnType<typeof getDb>["listRebates"];
  listShippingEvents: ReturnType<typeof getDb>["listShippingEvents"];
  listShippingEventItems: ReturnType<typeof getDb>["listShippingEventItems"];
}

interface HomeViewData extends HomeSummary {
  rebatesEnabled: boolean;
}

export default function HomePage({
  dataSource,
  now,
}: {
  dataSource?: HomeDataSource;
  now?: Date;
} = {}) {
  const [referenceNow] = useState(() => now ?? new Date());
  const [data, setData] = useState<HomeViewData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const shared = useAppData();

  const retry = useCallback(() => {
    setData(null);
    setError("");
    setAttempt((value) => value + 1);
    if (!dataSource && shared) void shared.refresh();
  }, [dataSource, shared]);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        if (!dataSource && shared) {
          if (shared.error) throw new Error(shared.error);
          if (!shared.data) return;
          const snapshot = shared.data;
          const rebatesEnabled = supportsRebateIncome(snapshot.preferences.workflow);
          if (active) setData({
            ...buildHomeSummary(
              snapshot.units,
              snapshot.sales,
              rebatesEnabled ? snapshot.rebates : [],
              snapshot.shippingEvents,
              snapshot.shippingEventItems,
              referenceNow,
            ),
            rebatesEnabled,
          });
          return;
        }
        const db = dataSource ?? getDb();
        const preferences = await db.getAccountPreferences();
        const rebatesEnabled = supportsRebateIncome(preferences.workflow);
        const [units, sales, rebates, shippingEvents, shippingEventItems] = await Promise.all([
          db.listUnits(),
          db.listSales(),
          rebatesEnabled ? db.listRebates() : Promise.resolve([]),
          db.listShippingEvents(),
          db.listShippingEventItems(),
        ]);
        if (active) {
          setData({
            ...buildHomeSummary(units, sales, rebates, shippingEvents, shippingEventItems, referenceNow),
            rebatesEnabled,
          });
        }
      } catch (reason: unknown) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "加载失败");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [attempt, dataSource, referenceNow, shared]);

  const monthLabel = `${referenceNow.getMonth() + 1}月`;
  const displayed = !dataSource && shared?.data
    ? (() => {
        const rebatesEnabled = supportsRebateIncome(shared.data.preferences.workflow);
        return {
          ...buildHomeSummary(
            shared.data.units,
            shared.data.sales,
            rebatesEnabled ? shared.data.rebates : [],
            shared.data.shippingEvents,
            shared.data.shippingEventItems,
            referenceNow,
          ),
          rebatesEnabled,
        };
      })()
    : data;

  return (
    <>
      <PageHeader title="首页" subtitle="极简进销存" />
      {error ? (
        <Card>
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 w-full rounded-xl bg-tint py-3 text-sm font-medium text-white"
          >
            重试加载
          </button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="库存数量"
            value={displayed ? String(displayed.inventoryCount) : "…"}
            hint="件"
          />
          <Stat
            label="库存成本"
            value={displayed ? formatCents(displayed.inventoryCostCents) : "…"}
            hint="按单件进价"
          />
          <Stat
            label={`${displayed?.monthLabel ?? monthLabel}销售额`}
            value={displayed ? formatCents(displayed.monthlySalesCents) : "…"}
            hint={displayed ? `已结算 ${displayed.monthlySalesCount} 件` : "按实际到账"}
          />
          <Stat
            label={`${displayed?.monthLabel ?? monthLabel}利润`}
            value={displayed ? formatCents(displayed.monthlyProfitCents) : "…"}
            hint={
              displayed?.rebatesEnabled
                ? `含返利 ${formatCents(displayed.monthlyRebateCents)}`
                : displayed
                  ? "按实际到账减进价和运费"
                  : "按实际到账"
            }
            featured
          />
          {displayed?.monthlySalesCount === 0 && (
            <p
              role="status"
              className="col-span-2 rounded-2xl bg-card px-4 py-3 text-sm leading-6 text-muted md:col-span-4"
            >
              {displayed.rebatesEnabled && displayed.monthlyRebateCents > 0
                ? "本月暂无已结算销售；当前利润来自返利收入。"
                : displayed.rebatesEnabled
                  ? "本月暂无已结算销售；完成结算或录入返利后将显示利润。"
                  : "本月暂无已结算销售；完成结算后将显示利润。"}
            </p>
          )}
          <Card className="col-span-2 md:col-span-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] text-muted">{displayed?.monthLabel ?? monthLabel}经营收支</p>
                <p className="mt-1 text-sm">运费支出</p>
              </div>
              <p className="shrink-0 text-lg font-semibold tabular-nums">
                {displayed ? formatCents(displayed.monthlyShippingCents) : "…"}
              </p>
            </div>
            {displayed?.rebatesEnabled && (
              <div className="mt-3 flex items-center justify-between gap-4 border-t border-separator pt-3">
                <p className="text-sm">返利收入</p>
                <p className="shrink-0 text-lg font-semibold tabular-nums text-[#21815C]">
                  {formatCents(displayed.monthlyRebateCents)}
                </p>
              </div>
            )}
          </Card>
        </div>
      )}
      {displayed && (
        <section aria-label="待办事项" className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">待办事项</h2>
            <Link href="/inventory" className="text-sm text-tint">查看库存</Link>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {[
              ["未到货", displayed.todoCounts.pending, "/inventory?view=active&status=pending"],
              ["已到货", displayed.todoCounts.arrived, "/inventory?view=active&status=arrived"],
              ["发往得物途中", displayed.todoCounts.shipping, "/inventory?view=active&status=shipping"],
              ["得物仓未售", displayed.todoCounts.in_stock_dewu, "/inventory?view=active&status=in_stock_dewu"],
              ["待结算", displayed.todoCounts.sold, "/inventory?view=settlement"],
              ["退回待处理", displayed.todoCounts.returned, "/inventory?view=active&status=returned"],
            ].map(([label, count, href]) => (
              <Link
                key={String(label)}
                href={String(href)}
                className="flex min-h-16 items-center justify-between rounded-[28px] border border-separator bg-card px-4 shadow-[var(--cirrus-shadow-1)] active:bg-background"
              >
                <span className="text-sm text-muted">{label}</span>
                <span className="text-xl font-semibold tabular-nums">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
