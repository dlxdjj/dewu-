"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import SaleFormSheet from "@/components/ui/SaleFormSheet";
import SizeAssignmentSheet from "@/components/ui/SizeAssignmentSheet";
import { useAppData } from "@/components/AppDataProvider";
import {
  PLATFORM_LABELS,
  PLATFORMS,
  type Platform,
} from "@/lib/constants/platform";
import { STATUS_META, UNIT_STATUSES, type UnitStatus } from "@/lib/constants/status";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import { deleteUnitDeep } from "@/lib/services/maintenance";
import type { UnitJoined } from "@/lib/types/database";
import { type GroupSelection, matchesGroup } from "@/lib/utils/group";
import { formatCents } from "@/lib/utils/money";

interface InventoryGroupPageProps {
  dataSource?: DbAdapter;
  initialQuery?: GroupSelection;
}

export default function InventoryGroupPage(
  props: InventoryGroupPageProps = {},
) {
  if (props.initialQuery) {
    return <GroupContent dataSource={props.dataSource} selection={props.initialQuery} />;
  }
  return (
    <Suspense fallback={<p>加载中…</p>}>
      <SearchParamGroup dataSource={props.dataSource} />
    </Suspense>
  );
}

function SearchParamGroup({ dataSource }: { dataSource?: DbAdapter }) {
  const params = useSearchParams();
  const platformValue = params.get("platform");
  const platform = PLATFORMS.some((item) => item.value === platformValue)
    ? (platformValue as Platform)
    : null;
  const scopeValue = params.get("scope");
  const scope = scopeValue === "active" || UNIT_STATUSES.includes(scopeValue as UnitStatus)
    ? scopeValue as "active" | UnitStatus
    : null;
  return (
    <GroupContent
      dataSource={dataSource}
      selection={{
        styleCode: params.get("style"),
        productId: params.get("product"),
        size: params.get("size") ?? "",
        platform,
        scope,
      }}
    />
  );
}

function GroupContent({
  dataSource,
  selection,
}: {
  dataSource?: DbAdapter;
  selection: GroupSelection;
}) {
  const [units, setUnits] = useState<UnitJoined[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settlementUnits, setSettlementUnits] = useState<UnitJoined[] | null>(
    null,
  );
  const [refresh, setRefresh] = useState(0);
  const [assigningSize, setAssigningSize] = useState(false);
  const shared = useAppData();
  const showPlatform = Boolean(dataSource) || shared?.data?.preferences.workflow === "standard";
  const resolveDb = useCallback(
    (): DbAdapter => dataSource ?? getDb(),
    [dataSource],
  );
  const { platform, productId, scope, size, styleCode } = selection;

  useEffect(() => {
    let active = true;
    const db = resolveDb();
    Promise.all([
      db.listUnits(),
      db.listProducts(),
      db.listBatches(),
      db.listSales(),
    ])
      .then(([raw, products, batches, sales]) => {
        if (!active) return;
        setError("");
        const productMap = new Map(
          products.map((product) => [product.id, product]),
        );
        const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
        const saleMap = new Map(sales.map((sale) => [sale.unit_id, sale]));
        setUnits(
          raw.flatMap((unit): UnitJoined[] => {
            const product = productMap.get(unit.product_id);
            const batch = batchMap.get(unit.batch_id);
            if (!product || !batch) return [];
            const joined: UnitJoined = {
              ...unit,
              product,
              batch,
              sale: saleMap.get(unit.id) ?? null,
            };
            return matchesGroup(joined, {
              platform,
              productId,
              size,
              styleCode,
              scope,
            })
              ? [joined]
              : [];
          }),
        );
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "加载失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [platform, productId, refresh, resolveDb, scope, size, styleCode]);

  const totalCost = units.reduce(
    (sum, unit) => sum + unit.unit_cost_cents,
    0,
  );
  const awaitingSettlement = units.filter((unit) => unit.status === "sold");
  const missingSizeUnits = units.filter((unit) => !unit.size.trim());

  async function settlementDone(): Promise<void> {
    setSettlementUnits(null);
    setRefresh((value) => value + 1);
  }

  return (
    <>
      <Link href="/inventory" className="text-tint">
        ‹ 库存
      </Link>
      <h1 className="mt-3 text-xl font-bold">
        {units[0]?.product.name ?? "合并库存"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {styleCode || "历史无货号"} · {size || "待补尺码"}
      </p>
      <Card className="mt-3">
        <p>{loading ? "数量 …" : `数量 ${units.length} 件`}</p>
        <p className="mt-1 text-sm text-muted">
          采购成本合计 {loading ? "…" : formatCents(totalCost)}
        </p>
        {awaitingSettlement.length > 0 && (
          <button
            type="button"
            onClick={() => setSettlementUnits(awaitingSettlement)}
            className="mt-3 min-h-11 w-full rounded-xl bg-[#1B7F37] px-3 text-[15px] font-medium text-white"
          >
            批量录到手价 · {awaitingSettlement.length} 件待结算
          </button>
        )}
        {missingSizeUnits.length > 0 && (
          <button
            type="button"
            onClick={() => setAssigningSize(true)}
            className="mt-3 min-h-11 w-full rounded-xl bg-tint px-3 text-[15px] font-medium"
          >
            补充尺码 · {missingSizeUnits.length} 件
          </button>
        )}
      </Card>
      <div className="mt-3 space-y-2">
        {units.map((unit, index) => (
          <div key={unit.id} className="rounded-xl bg-card p-3">
            <p className="text-[15px] leading-6">
              第 {index + 1} 件{showPlatform ? ` · ${PLATFORM_LABELS[unit.batch.platform]}` : ""} · 进价{" "}
              {formatCents(unit.unit_cost_cents)}
            </p>
            <p className="mt-0.5 text-sm leading-5 text-muted">
              {STATUS_META[unit.status].label} · 寄出运费{" "}
              {formatCents(unit.outbound_shipping_cents)}
              {unit.sale?.actual_payout_cents != null &&
                ` · 到手 ${formatCents(unit.sale.actual_payout_cents)}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              {(unit.status === "sold" || unit.status === "settled") && (
                <button
                  type="button"
                  onClick={() => setSettlementUnits([unit])}
                  className="min-h-11 text-[15px] font-medium text-[#1B7F37]"
                >
                  {unit.status === "settled" ? "修改到手价" : "录到手价"}
                </button>
              )}
              <Link
                href={`/inventory/detail?id=${unit.id}`}
                className="inline-flex min-h-11 items-center text-[15px] text-tint"
              >
                查看详情
              </Link>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("永久删除一件库存？已售/结算会影响利润报表。")) {
                    return;
                  }
                  try {
                    await deleteUnitDeep(resolveDb(), unit.id);
                    setUnits((old) =>
                      old.filter((item) => item.id !== unit.id),
                    );
                  } catch (reason) {
                    setError(
                      reason instanceof Error ? reason.message : "删除失败",
                    );
                  }
                }}
                className="ml-auto min-h-11 text-[15px] text-danger"
              >
                删除一件
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {settlementUnits && (
        <SaleFormSheet
          units={settlementUnits}
          dataSource={dataSource}
          onClose={() => setSettlementUnits(null)}
          onDone={settlementDone}
        />
      )}
      {assigningSize && (
        <SizeAssignmentSheet
          units={missingSizeUnits}
          onClose={() => setAssigningSize(false)}
          onConfirm={async (assignments) => {
            await resolveDb().assignUnitSizes(assignments);
            setAssigningSize(false);
            const sizeMap = new Map(assignments.map((item) => [item.unitId, item.size]));
            setUnits((old) => old.map((unit) =>
              sizeMap.has(unit.id) ? { ...unit, size: sizeMap.get(unit.id)! } : unit,
            ));
            await shared?.refresh();
          }}
        />
      )}
    </>
  );
}
