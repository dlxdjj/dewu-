"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import { useAppData } from "@/components/AppDataProvider";
import { REBATE_SOURCE_LABELS, type RebateSource } from "@/lib/constants/rebate";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import type { ReportDashboardResult } from "@/lib/data/types";
import {
  buildCsv,
  type SettlementSummary,
} from "@/lib/reports";
import { saveMonthlyRebates } from "@/lib/services/rebate";
import type { MonthlyRebate } from "@/lib/types/database";
import { monthKey } from "@/lib/utils/format";
import { formatCents, formatSignedCents, normalizeMoneyInput } from "@/lib/utils/money";
import { profitColor } from "@/lib/utils/profit";

export default function ReportsPage({
  dataSource,
  initialMonth,
}: {
  dataSource?: DbAdapter;
  initialMonth?: string;
} = {}) {
  const [month, setMonth] = useState(
    () => initialMonth ?? monthKey(new Date()),
  );
  const [report, setReport] = useState<ReportDashboardResult | null>(null);
  const [lossesOnly, setLossesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const shared = useAppData();

  const loadDashboard = useCallback(async (
    offset: number,
    replace: boolean,
  ): Promise<void> => {
    if (!dataSource && shared && !shared.data) {
      setLoading(shared.loading);
      setError(shared.error);
      return;
    }
    if (replace) setLoading(true);
    else setLoadingMore(true);
    setError("");
    try {
      const result = await (dataSource ?? getDb()).getReportDashboard({
        month,
        limit: 20,
        offset,
        lossesOnly,
      });
      setReport((current) => replace || !current
        ? result
        : { ...result, rows: [...current.rows, ...result.rows] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [dataSource, lossesOnly, month, shared]);

  useEffect(() => {
    void Promise.resolve().then(() => loadDashboard(0, true));
  }, [loadDashboard]);

  const rebatesEnabled = report?.rebatesEnabled ??
    (shared?.data?.preferences.workflow !== "bulk");
  const monthText = `${Number(month.slice(5))}月`;

  async function exportCsv(): Promise<void> {
    if (!report) return;
    setExporting(true);
    try {
      const db = dataSource ?? getDb();
      const rows = [];
      let offset = 0;
      let total = 1;
      while (offset < total) {
        const page = await db.getReportDashboard({
          month,
          limit: 100,
          offset,
          lossesOnly: false,
        });
        rows.push(...page.rows);
        total = page.totalRows;
        offset += page.rows.length;
        if (!page.rows.length) break;
      }
      const url = URL.createObjectURL(new Blob([
        buildCsv({
          allTime: report.allTime,
          selectedMonth: report.selectedMonth,
          rows,
          rebates: report.rebates,
        }, month, { includeRebates: rebatesEnabled }),
      ], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `报表-${month}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="报表"
        subtitle={rebatesEnabled ? "已结算实际到账 + 返利收入" : "已结算实际到账"}
      />
      {error ? (
        <Card>
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      ) : (
        <>
          <SummarySection
            ariaLabel="历史累计"
            title="历史累计"
            summary={report?.allTime ?? null}
            lifetime
            showRebates={rebatesEnabled}
          />
          <label className="mt-4 block min-w-0 text-sm">
            月份
            <span className="date-input-shell date-input-shell-card mt-1">
              <input
                aria-label="月份"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="mobile-date-input"
              />
            </span>
          </label>
          {report && rebatesEnabled && (
            <details className="mt-4 rounded-[28px] border border-separator bg-card p-4 shadow-[var(--cirrus-shadow-1)]">
              <summary className="cursor-pointer font-semibold">编辑本月返利</summary>
              <RebateEditor
                key={month}
                month={month}
                rebates={report.rebates}
                dataSource={dataSource ?? getDb()}
                embedded
                onSaved={async () => {
                  await shared?.refresh();
                  await loadDashboard(0, true);
                }}
              />
            </details>
          )}
          <SummarySection
            ariaLabel={`${monthText}统计`}
            title={rebatesEnabled ? `${monthText}结算与返利` : `${monthText}结算`}
            summary={report?.selectedMonth ?? null}
            showRebates={rebatesEnabled}
          />
          {report?.selectedMonth.salesCount === 0 && (
            <p
              role="status"
              className="mt-3 rounded-2xl bg-card px-4 py-3 text-sm leading-6 text-muted"
            >
              {rebatesEnabled && report.selectedMonth.rebateCents > 0
                ? "本月暂无已结算记录；已录入的返利仍计入本月利润。"
                : rebatesEnabled
                  ? "本月暂无已结算记录；完成结算或录入返利后将显示利润。"
                  : "本月暂无已结算记录；完成结算后将显示利润。"}
            </p>
          )}
          {report && report.selectedMonth.salesCount > 0 && (
            <SalesDetails
              report={report}
              lossesOnly={lossesOnly}
              onLossesOnlyChange={setLossesOnly}
              loadingMore={loadingMore}
              onLoadMore={() => void loadDashboard(report.rows.length, false)}
            />
          )}
        </>
      )}
      <button
        type="button"
        disabled={!report || loading || exporting}
        onClick={() => void exportCsv()}
        className="mt-4 w-full rounded-full border border-separator bg-card py-3.5 font-medium text-tint shadow-[var(--cirrus-shadow-1)] disabled:opacity-40"
      >
        {exporting ? "正在生成…" : "导出 CSV"}
      </button>
    </>
  );
}

function SalesDetails({
  report,
  lossesOnly,
  onLossesOnlyChange,
  loadingMore,
  onLoadMore,
}: {
  report: ReportDashboardResult;
  lossesOnly: boolean;
  onLossesOnlyChange: (value: boolean) => void;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section aria-label="销售明细" className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">销售明细</h2>
        <div className="flex rounded-full bg-card p-1 text-sm shadow-[var(--cirrus-shadow-1)]">
          <button
            type="button"
            aria-pressed={!lossesOnly}
            onClick={() => onLossesOnlyChange(false)}
            className={`min-h-10 rounded-full px-3 ${!lossesOnly ? "bg-label text-card" : "text-muted"}`}
          >
            全部
          </button>
          <button
            type="button"
            aria-pressed={lossesOnly}
            onClick={() => onLossesOnlyChange(true)}
            className={`min-h-10 rounded-full px-3 ${lossesOnly ? "bg-danger text-white" : "text-muted"}`}
          >
            仅看亏损
          </button>
        </div>
      </div>
      {report.rows.length ? (
        <div className="space-y-2">
          {report.rows.map((row) => (
            <article key={row.sale.id} className="rounded-[22px] border border-separator bg-card p-3 shadow-[var(--cirrus-shadow-1)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold">{row.product.name}</h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {row.product.style_code || "无货号"} · {row.unit.size || "待补尺码"}
                  </p>
                </div>
                <p className="shrink-0 font-bold" style={{ color: profitColor(row.profit) }}>
                  {formatSignedCents(row.profit)}
                </p>
              </div>
              <p className="mt-2 text-sm text-muted">
                到手 {formatCents(row.sale.actual_payout_cents)} · 成本 {formatCents(row.unit.unit_cost_cents)} · 运费 {formatCents(row.unit.outbound_shipping_cents)}
              </p>
              <p className="mt-1 text-xs text-muted">结算日期 {row.sale.settled_at ?? "—"}</p>
            </article>
          ))}
        </div>
      ) : (
        <Card><p className="text-sm text-muted">本月没有亏损商品。</p></Card>
      )}
      {report.rows.length < report.totalRows && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
          className="mt-3 min-h-12 w-full rounded-full border border-separator bg-card text-tint"
        >
          {loadingMore ? "加载中…" : `加载更多（剩余 ${report.totalRows - report.rows.length} 条）`}
        </button>
      )}
    </section>
  );
}

function RebateEditor({
  month,
  rebates,
  dataSource,
  onSaved,
  embedded = false,
}: {
  month: string;
  rebates: MonthlyRebate[];
  dataSource: DbAdapter;
  onSaved: (rebates: MonthlyRebate[]) => Promise<void> | void;
  embedded?: boolean;
}) {
  const amount = (source: RebateSource): number =>
    rebates.find(
      (rebate) => rebate.month.startsWith(month) && rebate.source === source,
    )?.amount_cents ?? 0;
  const [taobaoAlliance, setTaobaoAlliance] = useState(() =>
    centsForInput(amount("taobao_alliance")),
  );
  const [jingfen, setJingfen] = useState(() =>
    centsForInput(amount("jingfen")),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setSaveError("");
    try {
      const saved = await saveMonthlyRebates(dataSource, {
        month,
        taobaoAllianceYuan: taobaoAlliance,
        jingfenYuan: jingfen,
      });
      await onSaved(saved);
      setMessage("本月返利已保存并计入利润。");
    } catch (reason: unknown) {
      setSaveError(reason instanceof Error ? reason.message : "返利保存失败");
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <>
      <h2 className="font-semibold">本月返利</h2>
      <p className="mt-1 text-sm leading-5 text-muted">
        返利只增加利润，不增加销售额或销量。
      </p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-sm">
            {REBATE_SOURCE_LABELS.taobao_alliance}（元）
            <input
              aria-label="淘宝联盟返利"
              required
              inputMode="decimal"
              value={taobaoAlliance}
              onChange={(event) =>
                setTaobaoAlliance(normalizeMoneyInput(event.target.value))
              }
              className="mt-1 w-full min-w-0 rounded-xl bg-background px-3 py-3 text-base"
            />
          </label>
          <label className="min-w-0 text-sm">
            {REBATE_SOURCE_LABELS.jingfen}（元）
            <input
              aria-label="京粉返利"
              required
              inputMode="decimal"
              value={jingfen}
              onChange={(event) =>
                setJingfen(normalizeMoneyInput(event.target.value))
              }
              className="mt-1 w-full min-w-0 rounded-xl bg-background px-3 py-3 text-base"
            />
          </label>
        </div>
        {saveError && (
          <p role="alert" className="text-sm text-danger">
            {saveError}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-[#1B7F37]">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-tint py-3.5 text-[15px] font-medium text-white shadow-[var(--cirrus-shadow-2)] disabled:opacity-40"
        >
          {busy ? "保存中…" : "保存本月返利"}
        </button>
      </form>
    </>
  );
  return embedded
    ? <div className="mt-3">{content}</div>
    : <Card className="mt-4">{content}</Card>;
}

function SummarySection({
  ariaLabel,
  title,
  summary,
  lifetime = false,
  showRebates = true,
}: {
  ariaLabel: string;
  title: string;
  summary: SettlementSummary | null;
  lifetime?: boolean;
  showRebates?: boolean;
}) {
  return (
    <section aria-label={ariaLabel} className="mt-3">
      <h2 className="mb-2 text-sm font-medium text-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat
          label={lifetime ? "总利润" : "利润"}
          value={summary ? formatCents(summary.profitCents) : "…"}
          hint={
            summary && showRebates
              ? `含返利 ${formatCents(summary.rebateCents)}`
              : undefined
          }
          compact
        />
        <Stat
          label={lifetime ? "总运费" : "运费"}
          value={summary ? formatCents(summary.shippingCents) : "…"}
          hint="按寄出日期"
          compact
        />
        <Stat
          label={lifetime ? "总销售额" : "销售额"}
          value={summary ? formatCents(summary.salesCents) : "…"}
          compact
        />
        <Stat
          label={lifetime ? "总销量" : "销量"}
          value={summary ? String(summary.salesCount) : "…"}
          compact
        />
      </div>
    </section>
  );
}

function centsForInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
