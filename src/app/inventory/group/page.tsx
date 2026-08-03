"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import { PLATFORM_LABELS, PLATFORMS, type Platform } from "@/lib/constants/platform";
import { STATUS_META } from "@/lib/constants/status";
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
  return (
    <GroupContent
      dataSource={dataSource}
      selection={{
        styleCode: params.get("style"),
        productId: params.get("product"),
        size: params.get("size") ?? "",
        platform,
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
  const resolveDb = useCallback(
    (): DbAdapter => dataSource ?? getDb(),
    [dataSource],
  );
  const { platform, productId, size, styleCode } = selection;

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
  }, [platform, productId, resolveDb, size, styleCode]);

  const totalCost = units.reduce(
    (sum, unit) => sum + unit.unit_cost_cents,
    0,
  );

  return (
    <>
      <Link href="/inventory" className="text-tint">
        ‹ 库存
      </Link>
      <h1 className="mt-3 text-xl font-bold">合并库存</h1>
      <p className="mt-1 text-sm text-muted">
        {styleCode || "历史无货号"} · {size}
      </p>
      <Card className="mt-3">
        <p>{loading ? "数量 …" : `数量 ${units.length} 件`}</p>
        <p className="mt-1 text-sm text-muted">
          采购成本合计 {loading ? "…" : formatCents(totalCost)}
        </p>
      </Card>
      <div className="mt-3 space-y-2">
        {units.map((unit) => (
          <div key={unit.id} className="rounded-xl bg-card p-3">
            <p className="text-sm">
              {PLATFORM_LABELS[unit.batch.platform]} · {formatCents(unit.unit_cost_cents)} · {STATUS_META[unit.status].label}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <Link
                href={`/inventory/detail?id=${unit.id}`}
                className="text-sm text-tint"
              >
                查看单件
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
                className="text-sm text-[#FF3B30]"
              >
                删除一件
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-[#FF3B30]">{error}</p>}
    </>
  );
}
