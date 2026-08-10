"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import { getDb } from "@/lib/data";
import {
  buildHomeSummary,
  type HomeSummary,
} from "@/lib/home-summary";
import { formatCents } from "@/lib/utils/money";

interface HomeDataSource {
  listSales: ReturnType<typeof getDb>["listSales"];
  listUnits: ReturnType<typeof getDb>["listUnits"];
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
        if (active) setData(buildHomeSummary(units, sales, referenceNow));
      } catch (reason: unknown) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "加载失败");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [attempt, dataSource, referenceNow]);

  const monthLabel = `${referenceNow.getMonth() + 1}月`;

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
            value={data ? String(data.inventoryCount) : "…"}
            hint="件"
          />
          <Stat
            label="库存成本"
            value={data ? formatCents(data.inventoryCostCents) : "…"}
            hint="按单件进价"
          />
          <Stat
            label={`${data?.monthLabel ?? monthLabel}销量`}
            value={data ? String(data.monthlySalesCount) : "…"}
            hint="已结算"
          />
          <Stat
            label={`${data?.monthLabel ?? monthLabel}利润`}
            value={data ? formatCents(data.monthlyProfitCents) : "…"}
            hint="实际到账口径"
          />
          {data?.monthlySalesCount === 0 && (
            <p
              role="status"
              className="col-span-2 rounded-2xl bg-card px-4 py-3 text-sm leading-6 text-muted md:col-span-4"
            >
              本月暂无已结算销售；完成结算后将显示销量和利润。
            </p>
          )}
        </div>
      )}
    </>
  );
}
