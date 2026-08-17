"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import { useAppData } from "@/components/AppDataProvider";
import { getDb } from "@/lib/data";
import {
  buildHomeSummary,
  type HomeSummary,
} from "@/lib/home-summary";
import { formatCents } from "@/lib/utils/money";

interface HomeDataSource {
  listSales: ReturnType<typeof getDb>["listSales"];
  listUnits: ReturnType<typeof getDb>["listUnits"];
  listRebates: ReturnType<typeof getDb>["listRebates"];
  listShippingEvents: ReturnType<typeof getDb>["listShippingEvents"];
  listShippingEventItems: ReturnType<typeof getDb>["listShippingEventItems"];
}

export default function HomePage({
  dataSource,
  now,
}: {
  dataSource?: HomeDataSource;
  now?: Date;
} = {}) {
  const [referenceNow] = useState(() => now ?? new Date());
  const [data, setData] = useState<HomeSummary | null>(null);
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
          if (active) setData(buildHomeSummary(
            snapshot.units, snapshot.sales, snapshot.rebates,
            snapshot.shippingEvents, snapshot.shippingEventItems, referenceNow,
          ));
          return;
        }
        const db = dataSource ?? getDb();
        const [units, sales, rebates, shippingEvents, shippingEventItems] = await Promise.all([
          db.listUnits(),
          db.listSales(),
          db.listRebates(),
          db.listShippingEvents(),
          db.listShippingEventItems(),
        ]);
        if (active) {
          setData(buildHomeSummary(units, sales, rebates, shippingEvents, shippingEventItems, referenceNow));
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
    ? buildHomeSummary(
        shared.data.units,
        shared.data.sales,
        shared.data.rebates,
        shared.data.shippingEvents,
        shared.data.shippingEventItems,
        referenceNow,
      )
    : data;

  return (
    <div className="home-page">
      <PageHeader title="首页" />
      <div className="home-quick-actions" aria-label="首页快捷操作">
        <Link href="/inventory" className="home-quick-primary">查看库存</Link>
        <Link href="/reports" className="home-quick-secondary">本月报表</Link>
      </div>
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
        <section className="home-overview" aria-label="经营概览">
          <div className="home-overview-head">
            <div>
              <p className="home-overview-kicker">{displayed?.monthLabel ?? monthLabel}经营概览</p>
              <h2>本月经营结果</h2>
            </div>
            <span className="home-live-badge">LIVE</span>
          </div>
          <div className="home-stat-grid">
          <Stat
            label="库存数量"
            value={displayed ? String(displayed.inventoryCount) : "…"}
            hint="件"
            className="home-stat home-stat-inventory"
          />
          <Stat
            label="库存成本"
            value={displayed ? formatCents(displayed.inventoryCostCents) : "…"}
            hint="按单件进价"
            className="home-stat home-stat-cost"
          />
          <Stat
            label={`${displayed?.monthLabel ?? monthLabel}销售额`}
            value={displayed ? formatCents(displayed.monthlySalesCents) : "…"}
            hint={displayed ? `已结算 ${displayed.monthlySalesCount} 件` : "按实际到账"}
            className="home-stat home-stat-sales"
          />
          <Stat
            label={`${displayed?.monthLabel ?? monthLabel}利润`}
            value={displayed ? formatCents(displayed.monthlyProfitCents) : "…"}
            hint={
              displayed
                ? `含返利 ${formatCents(displayed.monthlyRebateCents)}`
                : "含返利收入"
            }
            featured
            className="home-stat home-stat-profit"
          />
          </div>
          {displayed?.monthlySalesCount === 0 && (
            <p
              role="status"
              className="col-span-2 rounded-2xl bg-card px-4 py-3 text-sm leading-6 text-muted md:col-span-4"
            >
              {displayed.monthlyRebateCents > 0
                ? "本月暂无已结算销售；当前利润来自返利收入。"
                : "本月暂无已结算销售；完成结算或录入返利后将显示利润。"}
            </p>
          )}
          <Card className="home-cashflow">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] text-muted">{displayed?.monthLabel ?? monthLabel}经营收支</p>
                <p className="mt-1 text-sm">运费支出</p>
              </div>
              <p className="shrink-0 text-lg font-semibold tabular-nums">
                {displayed ? formatCents(displayed.monthlyShippingCents) : "…"}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-separator pt-3">
              <p className="text-sm">返利收入</p>
              <p className="shrink-0 text-lg font-semibold tabular-nums text-[#21815C]">
                {displayed ? formatCents(displayed.monthlyRebateCents) : "…"}
              </p>
            </div>
          </Card>
        </section>
      )}
      {displayed && <StatusSignal summary={displayed} />}
      {displayed && (
        <section aria-label="待办事项" className="home-todos mt-5">
          <div className="home-section-head mb-2 flex items-center justify-between">
            <div>
              <p className="home-section-kicker">NEXT ACTIONS</p>
              <h2 className="font-semibold">待办事项</h2>
            </div>
            <Link href="/inventory" className="text-sm text-tint">查看全部 →</Link>
          </div>
          <div className="home-todo-grid">
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
                className="home-todo-item"
              >
                <span className="home-todo-copy"><b>{label}</b><small>点击查看并处理</small></span>
                <span className="home-todo-count">{String(count).padStart(2, "0")}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusSignal({ summary }: { summary: HomeSummary }) {
  const items = [
    { label: "得物仓未售 ·", count: summary.todoCounts.in_stock_dewu, tone: "stock" },
    { label: "运输途中 ·", count: summary.todoCounts.shipping, tone: "shipping" },
    { label: "已到货 ·", count: summary.todoCounts.arrived, tone: "arrived" },
    { label: "未到货 ·", count: summary.todoCounts.pending, tone: "pending" },
  ];
  const total = Math.max(1, items.reduce((sum, item) => sum + item.count, 0));

  return (
    <section className="home-signal" aria-label="库存状态分布">
      <div className="home-section-head">
        <div>
          <p className="home-section-kicker">INVENTORY SIGNAL</p>
          <h2>库存状态</h2>
        </div>
        <span>{summary.inventoryCount} 件当前库存</span>
      </div>
      <Card className="home-signal-card">
        <div className="home-signal-bar" aria-hidden="true">
          {items.map((item) => (
            item.count > 0 && (
              <span
                key={item.tone}
                data-tone={item.tone}
                style={{ flexGrow: item.count / total }}
              />
            )
          ))}
        </div>
        <div className="home-signal-legend">
          {items.map((item) => (
            <div key={item.tone}>
              <span><i data-tone={item.tone} />{item.label}</span>
              <b>{Math.round((item.count / total) * 100)}%</b>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
