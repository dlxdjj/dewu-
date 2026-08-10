"use client";

import { useCallback, useEffect, useState } from "react";
import BatchShippingSheet from "@/components/ui/BatchShippingSheet";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import GroupCard from "@/components/ui/GroupCard";
import PageHeader from "@/components/ui/PageHeader";
import SaleFormSheet from "@/components/ui/SaleFormSheet";
import { loadProductImageUrls } from "@/lib/catalog";
import { PLATFORMS } from "@/lib/constants/platform";
import {
  BATCH_STATUS_TARGETS,
  STATUS_META,
  type UnitStatus,
} from "@/lib/constants/status";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import { shipUnits } from "@/lib/services/shipping";
import { batchChangeStatus } from "@/lib/services/status";
import type { UnitJoined } from "@/lib/types/database";
import {
  buildGroups,
  filterUnitsByPlatform,
  type PlatformFilter,
  type UnitGroup,
} from "@/lib/utils/group";

export default function InventoryPage({
  dataSource,
}: {
  dataSource?: DbAdapter;
} = {}) {
  const [units, setUnits] = useState<UnitJoined[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [platformFilter, setPlatformFilter] =
    useState<PlatformFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [shipping, setShipping] = useState(false);
  const [settling, setSettling] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [target, setTarget] = useState<UnitStatus>("arrived");

  const resolveDb = useCallback(
    (): DbAdapter => dataSource ?? getDb(),
    [dataSource],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = resolveDb();
      const [raw, products, batches, sales] = await Promise.all([
        db.listUnits(),
        db.listProducts(),
        db.listBatches(),
        db.listSales(),
      ]);
      const productMap = new Map(
        products.map((product) => [product.id, product]),
      );
      const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
      const saleMap = new Map(sales.map((sale) => [sale.unit_id, sale]));
      const joined = raw.flatMap((unit): UnitJoined[] => {
        const product = productMap.get(unit.product_id);
        const batch = batchMap.get(unit.batch_id);
        return product && batch
          ? [
              {
                ...unit,
                product,
                batch,
                sale: saleMap.get(unit.id) ?? null,
              },
            ]
          : [];
      });
      const urls = await loadProductImageUrls(
        db,
        new Set(joined.map((unit) => unit.product_id)),
      );
      setUnits(joined);
      setImageUrls(urls);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [resolveDb]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const visibleUnits = filterUnitsByPlatform(units, platformFilter);
  const groups = buildGroups(visibleUnits);
  const availablePlatforms = PLATFORMS.filter((option) =>
    units.some((unit) => unit.batch.platform === option.value),
  );
  const chosen = units.filter((unit) => selected.has(unit.id));

  function switchPlatform(filter: PlatformFilter): void {
    setPlatformFilter(filter);
    setSelected(new Set());
  }

  function toggleGroup(group: UnitGroup): void {
    setSelected((old) => {
      const next = new Set(old);
      const allSelected = group.units.every((unit) => next.has(unit.id));
      for (const unit of group.units) {
        if (allSelected) next.delete(unit.id);
        else next.add(unit.id);
      }
      return next;
    });
  }

  async function done(): Promise<void> {
    setShipping(false);
    setSettling(false);
    setSelecting(false);
    setSelected(new Set());
    await load();
  }

  return (
    <>
      <div className="flex justify-between gap-3">
        <PageHeader
          title="库存"
          subtitle={
            loading ? "加载中…" : `${visibleUnits.length} 件 · ${groups.length} 组`
          }
        />
        <button
          type="button"
          onClick={() => {
            setSelecting((value) => !value);
            setSelected(new Set());
          }}
          className="h-9 shrink-0 rounded-full bg-card px-4 text-sm"
        >
          {selecting ? "取消" : "批量"}
        </button>
      </div>

      {!loading && units.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            aria-pressed={platformFilter === "all"}
            onClick={() => switchPlatform("all")}
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${
              platformFilter === "all"
                ? "bg-label text-card"
                : "bg-card text-label"
            }`}
          >
            全部
          </button>
          {availablePlatforms.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={platformFilter === option.value}
              onClick={() => switchPlatform(option.value)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm ${
                platformFilter === option.value
                  ? "bg-label text-card"
                  : "bg-card text-label"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <Card>
          <p className="text-sm text-[#FF3B30]">{error}</p>
          <button type="button" onClick={load} className="mt-2 text-sm text-tint">
            重试
          </button>
        </Card>
      ) : !loading && units.length === 0 ? (
        <Card>
          <EmptyState title="暂无库存" subtitle="点底部“添加”录入第一件商品" />
        </Card>
      ) : !loading && groups.length === 0 ? (
        <Card>
          <EmptyState title="该平台暂无库存" subtitle="请选择其他购入平台" />
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <GroupCard
              key={group.key}
              group={group}
              imageUrl={imageUrls.get(group.product.id) ?? null}
              platformFilter={platformFilter}
              selectable={selecting}
              selected={group.units.every((unit) => selected.has(unit.id))}
              onToggle={() => toggleGroup(group)}
            />
          ))}
        </div>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-40 border-t border-separator bg-card p-3">
          <div className="mx-auto flex max-w-lg flex-wrap gap-2">
            <span className="w-full text-center text-xs text-muted">
              已选 {selected.size} 件
            </span>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => setShipping(true)}
              className="flex-1 rounded-xl bg-tint py-2.5 text-sm text-white disabled:opacity-40"
            >
              批量寄出
            </button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => setSettling(true)}
              className="flex-1 rounded-xl bg-[#34C759] py-2.5 text-sm text-white disabled:opacity-40"
            >
              录到手价
            </button>
            <select
              aria-label="目标状态"
              value={target}
              onChange={(event) => setTarget(event.target.value as UnitStatus)}
              className="min-w-0 flex-1 rounded-xl bg-background px-2 text-sm"
            >
              {BATCH_STATUS_TARGETS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selected.size || changingStatus}
              onClick={async () => {
                setChangingStatus(true);
                setError("");
                try {
                  await batchChangeStatus(resolveDb(), chosen, target);
                  await done();
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : "状态修改失败");
                } finally {
                  setChangingStatus(false);
                }
              }}
              className="rounded-xl bg-label px-4 py-2.5 text-sm text-white disabled:opacity-40"
            >
              {changingStatus ? "处理中…" : "改状态"}
            </button>
          </div>
        </div>
      )}

      {shipping && (
        <BatchShippingSheet
          units={chosen}
          onClose={() => setShipping(false)}
          onConfirm={async (total, overwrite) => {
            await shipUnits(resolveDb(), {
              unitIds: chosen.map((unit) => unit.id),
              totalShippingCents: total,
              overwriteConfirmed: overwrite,
            });
            await done();
          }}
        />
      )}
      {settling && (
        <SaleFormSheet
          units={chosen}
          onClose={() => setSettling(false)}
          onDone={done}
        />
      )}
    </>
  );
}
