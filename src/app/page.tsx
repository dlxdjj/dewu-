"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Stat from "@/components/ui/Stat";
import { getDb } from "@/lib/data";
import { unitProfit } from "@/lib/utils/profit";
import { formatCents } from "@/lib/utils/money";
import { ACTIVE_STATUSES } from "@/lib/constants/status";

interface HomeSummary {
  count: number;
  cost: number;
  profit: number;
  unsettled: number;
}

interface HomeDataSource {
  listSales: ReturnType<typeof getDb>["listSales"];
  listUnits: ReturnType<typeof getDb>["listUnits"];
}

export default function HomePage({
  dataSource,
}: {
  dataSource?: HomeDataSource;
} = {}) {
  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setData(null);
    setError("");
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const db = dataSource ?? getDb();
        const [units, sales] = await Promise.all([
          db.listUnits(),
          db.listSales(),
        ]);
        if (!active) return;
        const validUnits = units.filter((unit) => unit.status !== "refunded");
        const saleMap = new Map(sales.map((sale) => [sale.unit_id, sale]));
        setData({
          count: validUnits.filter((unit) =>
            ACTIVE_STATUSES.includes(unit.status),
          ).length,
          cost: validUnits
            .filter((unit) => ACTIVE_STATUSES.includes(unit.status))
            .reduce((sum, unit) => sum + unit.unit_cost_cents, 0),
          profit: validUnits.reduce(
            (sum, unit) =>
              sum + (unitProfit(unit, saleMap.get(unit.id)).value ?? 0),
            0,
          ),
          unsettled: validUnits.filter(
            (unit) =>
              unit.status === "sold" &&
              saleMap.get(unit.id)?.actual_payout_cents == null,
          ).length,
        });
      } catch (reason: unknown) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "加载失败");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [attempt, dataSource]);

  return (
    <>
      <PageHeader title="首页" subtitle="极简进销存" />
      {error ? (
        <Card>
          <p className="text-sm text-[#FF3B30]">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 w-full rounded-xl bg-tint py-3 text-sm font-medium text-white"
          >
            重试加载
          </button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="有效库存"
            value={data ? String(data.count) : "…"}
            hint="退款件已排除"
          />
          <Stat
            label="库存资金"
            value={data ? formatCents(data.cost) : "…"}
            hint="按单件进价"
          />
          <Stat
            label="实际利润"
            value={data ? formatCents(data.profit) : "…"}
            hint="仅已结算"
          />
          <Stat
            label="未结算"
            value={data ? String(data.unsettled) : "…"}
            hint="件"
          />
        </div>
      )}
      <Card className="mt-4">
        <p className="text-sm text-muted">
          利润唯一口径：到手价 − 进价 − 均摊寄出快递费。
        </p>
      </Card>
    </>
  );
}
