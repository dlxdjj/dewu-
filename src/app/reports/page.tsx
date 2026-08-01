"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { ChartIcon, ChevronRightIcon } from "@/components/ui/icons";
import { getDb } from "@/lib/data";
import { buildCsv, buildMonthlyReport, type ReportBasis } from "@/lib/reports";
import { formatCny, formatPercent, monthKey, monthLabel } from "@/lib/utils/format";
import { profitColor } from "@/lib/utils/profit";

export default function ReportsPage() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [basis, setBasis] = useState<ReportBasis>("settled");
  const [raw, setRaw] = useState<Awaited<
    ReturnType<typeof loadAll>
  > | null>(null);

  useEffect(() => {
    loadAll().then(setRaw).catch(() => setRaw(null));
  }, []);

  const report = useMemo(() => {
    if (!raw) return null;
    return buildMonthlyReport({ ...raw, month, basis });
  }, [raw, month, basis]);

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y, m - 1 + delta, 1)));
  }

  function exportCsv() {
    if (!report) return;
    const blob = new Blob([buildCsv(report, month, basis)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `报表-${month}-${basis === "settled" ? "按结算" : "按售出"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxDaily = Math.max(1, ...(report?.daily.map((d) => Math.abs(d.profit)) ?? [1]));

  return (
    <>
      <PageHeader title="报表" subtitle="经营复盘" />

      {/* 月份切换 */}
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="上一月" className="p-1.5 text-tint">
          <ChevronRightIcon size={18} className="rotate-180" />
        </button>
        <span className="text-[16px] font-semibold">{monthLabel(month)}</span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="下一月" className="p-1.5 text-tint">
          <ChevronRightIcon size={18} />
        </button>
      </div>

      {/* 统计口径切换 */}
      <div className="mb-4 flex rounded-xl bg-[#e9e9eb] p-0.5 text-[13px]">
        {(
          [
            ["settled", "按结算日期（默认）"],
            ["sold", "按售出日期"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setBasis(v)}
            className={`flex-1 rounded-[10px] py-1.5 ${
              basis === v ? "bg-card font-medium shadow-sm" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!report ? (
        <p className="py-12 text-center text-[13px] text-muted">加载中…</p>
      ) : report.rows.length === 0 && report.soldCount === 0 ? (
        <Card>
          <EmptyState
            icon={<ChartIcon size={40} strokeWidth={1.4} />}
            title="本月暂无销售数据"
            subtitle="发生售出或结算后，这里会展示利润统计"
          />
        </Card>
      ) : (
        <>
          {/* 核心指标 */}
          <Card className="mb-3">
            <p className="text-[13px] text-muted">
              {basis === "settled" ? "本月实际利润（按结算）" : "本月利润（按售出）"}
            </p>
            <p
              className="mt-1 text-[34px] font-bold leading-tight"
              style={{ color: profitColor(report.actualProfitTotal || null) }}
            >
              {formatCny(report.actualProfitTotal)}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              另有预计利润 {formatCny(report.expectedProfitTotal)}（未结算）
            </p>
          </Card>

          <div className="mb-3 grid grid-cols-3 gap-2.5">
            <MiniStat label="销售总额" value={formatCny(report.totalSoldAmount)} />
            <MiniStat label="实际到账" value={formatCny(report.totalPayout)} />
            <MiniStat label="预计利润" value={formatCny(report.expectedProfitTotal)} />
            <MiniStat label="售出数量" value={`${report.soldCount} 件`} />
            <MiniStat label="结算数量" value={`${report.settledCount} 件`} />
            <MiniStat label="平均利润率" value={formatPercent(report.avgMargin)} />
            <MiniStat label="当前库存成本" value={formatCny(report.activeStockCost)} />
            <MiniStat label="得物仓货值" value={formatCny(report.dewuStockValue)} />
          </div>

          {/* 每日利润趋势 */}
          <SectionTitle>每日利润趋势</SectionTitle>
          <Card>
            {report.daily.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">本月暂无利润记录</p>
            ) : (
              <div className="flex h-28 items-end gap-[3px]">
                {report.daily.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] text-muted">{formatCny(d.profit).replace("¥", "")}</span>
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${Math.max(4, (Math.abs(d.profit) / maxDaily) * 64)}px`,
                        backgroundColor: d.profit >= 0 ? "#34C759" : "#FF3B30",
                      }}
                      title={`${d.day}日 ${formatCny(d.profit)}`}
                    />
                    <span className="text-[9px] text-muted">{d.day}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 平台利润排行 */}
          <SectionTitle>采购平台利润排行</SectionTitle>
          <Card className="space-y-2">
            {report.platformRanking.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-muted">暂无数据</p>
            ) : (
              report.platformRanking.map((p) => (
                <div key={p.platform} className="flex items-center justify-between text-[14px]">
                  <span>{p.label}<span className="ml-1 text-[12px] text-muted">{p.count} 件</span></span>
                  <span className="font-semibold" style={{ color: profitColor(p.profit) }}>
                    {formatCny(p.profit)}
                  </span>
                </div>
              ))
            )}
          </Card>

          {/* 商品榜 */}
          <SectionTitle>赚钱最多的商品</SectionTitle>
          <RankCard items={report.topProducts} empty="本月暂无盈利商品" positive />
          <SectionTitle>亏损商品</SectionTitle>
          <RankCard items={report.losingProducts} empty="本月没有亏损商品" />

          {/* 滞留榜 */}
          <SectionTitle>库存停留最久</SectionTitle>
          <Card className="space-y-2">
            {report.longestStaying.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-muted">当前没有在库商品</p>
            ) : (
              report.longestStaying.map((it) => (
                <Link key={it.id} href={`/inventory/${it.id}`} className="flex items-center justify-between text-[14px]">
                  <span className="truncate">{it.name}</span>
                  <span className="shrink-0 text-muted">{it.days} 天</span>
                </Link>
              ))
            )}
          </Card>
        </>
      )}

      <button
        type="button"
        onClick={exportCsv}
        disabled={!report}
        className="mt-4 w-full rounded-xl bg-card py-3 text-[15px] font-medium text-tint shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-background disabled:opacity-40"
      >
        导出 CSV
      </button>
      <div className="h-4" />
    </>
  );
}

async function loadAll() {
  const db = getDb();
  const [units, products, batches, sales] = await Promise.all([
    db.listUnits(),
    db.listProducts(),
    db.listBatches(),
    db.listSales(),
  ]);
  return { units, products, batches, sales };
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[14px] font-semibold">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <p className="mb-1.5 mt-5 px-1 text-[13px] text-muted">{children}</p>;
}

function RankCard({
  items,
  empty,
  positive,
}: {
  items: { name: string; profit: number }[];
  empty: string;
  positive?: boolean;
}) {
  return (
    <Card className="space-y-2">
      {items.length === 0 ? (
        <p className="py-2 text-center text-[13px] text-muted">{empty}</p>
      ) : (
        items.map((it, i) => (
          <div key={it.name} className="flex items-center justify-between text-[14px]">
            <span className="truncate">
              <span className="mr-1.5 text-[12px] text-muted">{i + 1}.</span>
              {it.name}
            </span>
            <span
              className="shrink-0 font-semibold"
              style={{ color: positive ? "#34C759" : "#FF3B30" }}
            >
              {formatCny(it.profit)}
            </span>
          </div>
        ))
      )}
    </Card>
  );
}
