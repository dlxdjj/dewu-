"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import {
  buildCsv,
  buildSettlementReport,
  type SettlementSummary,
} from "@/lib/reports";
import type {
  InventoryUnit,
  Product,
  PurchaseBatch,
  Sale,
} from "@/lib/types/database";
import { monthKey } from "@/lib/utils/format";
import { formatCents } from "@/lib/utils/money";

interface ReportSource {
  units: InventoryUnit[];
  products: Product[];
  batches: PurchaseBatch[];
  sales: Sale[];
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

  useEffect(() => {
    let active = true;
    const db = dataSource ?? getDb();
    Promise.all([
      db.listUnits(),
      db.listProducts(),
      db.listBatches(),
      db.listSales(),
    ])
      .then(([units, products, batches, sales]) => {
        if (active) setRaw({ units, products, batches, sales });
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "加载失败");
        }
      });
    return () => {
      active = false;
    };
  }, [dataSource]);

  const report = useMemo(
    () => (raw ? buildSettlementReport({ ...raw, month }) : null),
    [raw, month],
  );
  const monthText = `${Number(month.slice(5))}月`;

  return (
    <>
      <PageHeader title="报表" subtitle="实际结算与实际到账口径" />
      {error ? (
        <Card>
          <p className="text-sm text-[#FF3B30]">{error}</p>
        </Card>
      ) : (
        <>
          <SummarySection
            ariaLabel="历史累计"
            title="历史累计"
            summary={report?.allTime ?? null}
            lifetime
          />
          <label className="mt-4 block min-w-0 text-sm">
            月份
            <input
              aria-label="月份"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="mt-1 w-full min-w-0 max-w-full box-border rounded-xl bg-card px-3 py-3"
            />
          </label>
          <SummarySection
            ariaLabel={`${monthText}统计`}
            title={`${monthText}结算`}
            summary={report?.selectedMonth ?? null}
          />
        </>
      )}
      <button
        type="button"
        disabled={!report}
        onClick={() => {
          if (!report) return;
          const url = URL.createObjectURL(
            new Blob([buildCsv(report, month)], {
              type: "text/csv;charset=utf-8",
            }),
          );
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `报表-${month}.csv`;
          anchor.click();
          URL.revokeObjectURL(url);
        }}
        className="mt-4 w-full rounded-xl bg-card py-3 text-tint disabled:opacity-40"
      >
        导出 CSV
      </button>
    </>
  );
}

function SummarySection({
  ariaLabel,
  title,
  summary,
  lifetime = false,
}: {
  ariaLabel: string;
  title: string;
  summary: SettlementSummary | null;
  lifetime?: boolean;
}) {
  return (
    <section aria-label={ariaLabel} className="mt-3">
      <h2 className="mb-2 text-sm font-medium text-muted">{title}</h2>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label={lifetime ? "总利润" : "利润"}
          value={summary ? formatCents(summary.profitCents) : "…"}
        />
        <Stat
          label={lifetime ? "总销售额" : "销售额"}
          value={summary ? formatCents(summary.salesCents) : "…"}
        />
        <Stat
          label={lifetime ? "总销量" : "销量"}
          value={summary ? String(summary.salesCount) : "…"}
        />
      </div>
    </section>
  );
}
