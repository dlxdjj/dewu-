"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { getDb, dbKind } from "@/lib/data";
import { actualProfit, daysInStatus, round2 } from "@/lib/utils/profit";
import { ACTIVE_STATUSES, STALE_RULES } from "@/lib/constants/status";
import { formatCny, monthKey } from "@/lib/utils/format";
import type { UnitStatus } from "@/lib/constants/status";

interface TodoItem {
  id: string;
  name: string;
  status: UnitStatus;
  days: number;
  hint: string;
}

export default function HomePage() {
  const [stats, setStats] = useState<{
    onHand: number;
    inDewu: number;
    monthProfit: number;
    monthSoldCount: number;
    activeStockCost: number;
    dewuStockValue: number;
    todos: TodoItem[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const db = getDb();
      const [units, products, sales, history] = await Promise.all([
        db.listUnits(),
        db.listProducts(),
        db.listSales(),
        db.listHistory(),
      ]);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const saleMap = new Map(sales.map((s) => [s.unit_id, s]));
      const thisMonth = monthKey(new Date());

      const last: Record<string, string> = {};
      for (const h of history) {
        if (!last[h.unit_id] || h.created_at > last[h.unit_id]) {
          last[h.unit_id] = h.created_at;
        }
      }

      let monthProfit = 0;
      let monthSoldCount = 0;
      let activeStockCost = 0;
      let dewuStockValue = 0;
      const todos: TodoItem[] = [];

      for (const u of units) {
        const sale = saleMap.get(u.id);
        const name = productMap.get(u.product_id)?.name ?? "未知商品";
        const days = daysInStatus(u, last[u.id] ?? null);

        if (u.status === "settled" && sale?.settled_at?.startsWith(thisMonth)) {
          monthProfit += actualProfit(u.unit_cost, sale) ?? 0;
        }
        if ((u.status === "sold" || u.status === "settled") && sale?.sold_at?.startsWith(thisMonth)) {
          monthSoldCount += 1;
        }
        if (ACTIVE_STATUSES.includes(u.status)) {
          activeStockCost += u.unit_cost;
        }
        if (u.status === "in_stock_dewu") {
          dewuStockValue += u.listing_price ?? u.unit_cost;
        }

        // 待办：待结算 / 退回 / 滞留
        if (u.status === "sold") {
          todos.push({ id: u.id, name, status: u.status, days, hint: "已售待结算，记得登记到账" });
        } else if (u.status === "returned") {
          todos.push({ id: u.id, name, status: u.status, days, hint: "退回待处理" });
        } else {
          const rule = STALE_RULES.find((r) => r.status === u.status && days >= r.days);
          if (rule) {
            todos.push({ id: u.id, name, status: u.status, days, hint: rule.hint });
          }
        }
      }

      // 退回 > 待结算 > 滞留（按天数降序）
      const priority = (t: TodoItem) =>
        t.status === "returned" ? 2 : t.status === "sold" ? 1 : 0;
      todos.sort((a, b) => priority(b) - priority(a) || b.days - a.days);

      setStats({
        onHand: units.filter((u) => u.status === "arrived").length,
        inDewu: units.filter((u) => u.status === "in_stock_dewu").length,
        monthProfit: round2(monthProfit),
        monthSoldCount,
        activeStockCost: round2(activeStockCost),
        dewuStockValue: round2(dewuStockValue),
        todos: todos.slice(0, 6),
      });
    })().catch(() => {});
  }, []);

  return (
    <>
      <PageHeader title="首页" subtitle="今日概览" />

      {/* 资金概览（全宽） */}
      <Card className="mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-muted">在库资金占用</p>
            <p className="mt-1 text-[26px] font-bold leading-none">
              {stats ? formatCny(stats.activeStockCost) : "…"}
            </p>
            <p className="mt-1.5 text-[11px] text-muted">在途 / 现货 / 途中 / 仓内 / 退回的成本</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] text-muted">得物仓货值</p>
            <p className="mt-1 text-[26px] font-bold leading-none">
              {stats ? formatCny(stats.dewuStockValue) : "…"}
            </p>
            <p className="mt-1.5 text-[11px] text-muted">按挂牌价，未填按成本</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="现货在手" value={stats ? String(stats.onHand) : "…"} hint="件" />
        <Stat label="得物仓未售" value={stats ? String(stats.inDewu) : "…"} hint="件" />
        <Stat
          label="本月已结算利润"
          value={stats ? formatCny(stats.monthProfit) : "…"}
          hint="按结算月统计"
        />
        <Stat label="本月售出" value={stats ? String(stats.monthSoldCount) : "…"} hint="件" />
      </div>

      <h2 className="mb-2 mt-6 text-[17px] font-semibold">待办</h2>
      <Card>
        {!stats ? (
          <p className="py-8 text-center text-[13px] text-muted">加载中…</p>
        ) : stats.todos.length === 0 ? (
          <EmptyState title="暂无待办" subtitle="待结算、退回件和滞留商品会显示在这里" />
        ) : (
          <div className="divide-y divide-separator">
            {stats.todos.map((t) => (
              <Link
                key={t.id}
                href={`/inventory/${t.id}`}
                className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px]">{t.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {t.hint} · {t.days} 天
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-6 text-center text-[11px] text-muted">
        数据源：{dbKind() === "supabase" ? "Supabase 云端" : "浏览器本地（未配置 Supabase）"}
      </p>
    </>
  );
}
