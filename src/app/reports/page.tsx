"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import { useAppData } from "@/components/AppDataProvider";
import { supportsRebateIncome } from "@/lib/account-features";
import { REBATE_SOURCE_LABELS, type RebateSource } from "@/lib/constants/rebate";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import {
  buildCsv,
  buildSettlementReport,
  type SettlementSummary,
} from "@/lib/reports";
import { saveMonthlyRebates } from "@/lib/services/rebate";
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
import { monthKey } from "@/lib/utils/format";
import { formatCents, normalizeMoneyInput } from "@/lib/utils/money";

interface ReportSource {
  preferences: AccountPreferences;
  units: InventoryUnit[];
  products: Product[];
  batches: PurchaseBatch[];
  sales: Sale[];
  rebates: MonthlyRebate[];
  shippingEvents: ShippingEvent[];
  shippingEventItems: ShippingEventItem[];
}

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
  const [raw, setRaw] = useState<ReportSource | null>(null);
  const [error, setError] = useState("");
  const shared = useAppData();

  useEffect(() => {
    let active = true;
    if (!dataSource && shared) {
      return () => { active = false; };
    }
    const db = dataSource ?? getDb();
    async function load(): Promise<void> {
      try {
        const preferences = await db.getAccountPreferences();
        const rebatesEnabled = supportsRebateIncome(preferences.workflow);
        const [units, products, batches, sales, rebates, shippingEvents, shippingEventItems] = await Promise.all([
          db.listUnits(),
          db.listProducts(),
          db.listBatches(),
          db.listSales(),
          rebatesEnabled ? db.listRebates() : Promise.resolve([]),
          db.listShippingEvents(),
          db.listShippingEventItems(),
        ]);
        if (active) setRaw({ preferences, units, products, batches, sales, rebates, shippingEvents, shippingEventItems });
      } catch (reason: unknown) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "加载失败");
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [dataSource, shared]);

  const source = !dataSource && shared ? shared.data : raw;
  const displayError = !dataSource && shared ? shared.error : error;
  const rebatesEnabled = source
    ? supportsRebateIncome(source.preferences.workflow)
    : true;

  const report = useMemo(
    () => (source ? buildSettlementReport({ ...source, month, includeRebates: rebatesEnabled }) : null),
    [source, month, rebatesEnabled],
  );
  const monthText = `${Number(month.slice(5))}月`;

  return (
    <>
      <PageHeader
        title="报表"
        subtitle={rebatesEnabled ? "已结算实际到账 + 返利收入" : "已结算实际到账"}
      />
      {displayError ? (
        <Card>
          <p role="alert" className="text-sm text-danger">
            {displayError}
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
          {source && rebatesEnabled && (
            <RebateEditor
              key={month}
              month={month}
              rebates={source.rebates}
              dataSource={dataSource ?? getDb()}
              onSaved={(saved) => {
                setRaw((current) =>
                  current
                    ? {
                        ...current,
                        rebates: [
                          ...current.rebates.filter(
                            (rebate) => !rebate.month.startsWith(month),
                          ),
                          ...saved,
                        ],
                      }
                    : current,
                );
              }}
            />
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
        </>
      )}
      <button
        type="button"
        disabled={!report}
        onClick={() => {
          if (!report) return;
          const url = URL.createObjectURL(
            new Blob([buildCsv(report, month, { includeRebates: rebatesEnabled })], {
              type: "text/csv;charset=utf-8",
            }),
          );
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `报表-${month}.csv`;
          anchor.click();
          URL.revokeObjectURL(url);
        }}
        className="mt-4 w-full rounded-full border border-separator bg-card py-3.5 font-medium text-tint shadow-[var(--cirrus-shadow-1)] disabled:opacity-40"
      >
        导出 CSV
      </button>
    </>
  );
}

function RebateEditor({
  month,
  rebates,
  dataSource,
  onSaved,
}: {
  month: string;
  rebates: MonthlyRebate[];
  dataSource: DbAdapter;
  onSaved: (rebates: MonthlyRebate[]) => void;
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
      onSaved(saved);
      setMessage("本月返利已保存并计入利润。");
    } catch (reason: unknown) {
      setSaveError(reason instanceof Error ? reason.message : "返利保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4">
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
    </Card>
  );
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
