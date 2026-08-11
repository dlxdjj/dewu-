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
  STATUS_FILTER_OPTIONS,
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
  filterUnitsByStatus,
  type PlatformFilter,
  type StatusFilter,
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [shipping, setShipping] = useState(false);
  const [settlementUnits, setSettlementUnits] = useState<UnitJoined[] | null>(
    null,
  );
  const [changingStatus, setChangingStatus] = useState(false);
  const [target, setTarget] = useState<UnitStatus>("arrived");

  const resolveDb = useCallback(
    (): DbAdapter => dataSource ?? getDb(),
    [dataSource],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
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
      setLoadError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [resolveDb]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const platformUnits = filterUnitsByPlatform(units, platformFilter);
  const visibleUnits = filterUnitsByStatus(platformUnits, statusFilter);
  const groups = buildGroups(visibleUnits);
  const availablePlatforms = PLATFORMS.filter((option) =>
    units.some((unit) => unit.batch.platform === option.value),
  );
  const chosen = units.filter((unit) => selected.has(unit.id));

  function switchPlatform(filter: PlatformFilter): void {
    setPlatformFilter(filter);
    setSelected(new Set());
    setActionError("");
  }

  function switchStatus(filter: StatusFilter): void {
    setStatusFilter(filter);
    setSelected(new Set());
    setActionError("");
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
    setSettlementUnits(null);
    setSelecting(false);
    setSelected(new Set());
    setActionError("");
    await load();
  }

  function prepareShipping(candidates: UnitJoined[]): void {
    setActionError("");
    if (candidates.some((unit) => unit.status === "refunded")) {
      setActionError("选择中包含退款件，请先按状态筛选后再寄出。");
      return;
    }
    if (
      candidates.some(
        (unit) => unit.status === "sold" || unit.status === "settled",
      ) &&
      !window.confirm("重新寄出会删除所选商品已有的销售和利润记录，确认继续？")
    ) {
      return;
    }
    setShipping(true);
  }

  function prepareSettlement(candidates: UnitJoined[]): void {
    setActionError("");
    if (candidates.some((unit) => unit.status === "refunded")) {
      setActionError("选择中包含退款件，请先按状态筛选后再录到手价。");
      return;
    }
    setSettlementUnits(candidates);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
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
            setActionError("");
          }}
          className="min-h-11 shrink-0 rounded-full bg-card px-4 text-[15px]"
        >
          {selecting ? "退出批量" : "批量操作"}
        </button>
      </div>

      {!loading && units.length > 0 && (
        <div className="mb-3 space-y-2.5">
          <div
            aria-label="按采购平台筛选"
            className="no-scrollbar flex gap-2 overflow-x-auto pb-1"
          >
            <button
              type="button"
              aria-pressed={platformFilter === "all"}
              onClick={() => switchPlatform("all")}
              className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-[15px] ${
                platformFilter === "all"
                  ? "bg-label text-card"
                  : "bg-card text-label"
              }`}
            >
              全部平台
            </button>
            {availablePlatforms.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={platformFilter === option.value}
                onClick={() => switchPlatform(option.value)}
                className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-[15px] ${
                  platformFilter === option.value
                    ? "bg-label text-card"
                    : "bg-card text-label"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div
            aria-label="按库存状态筛选"
            className="no-scrollbar flex gap-2 overflow-x-auto pb-1"
          >
            <button
              type="button"
              aria-label="全部状态"
              aria-pressed={statusFilter === "all"}
              onClick={() => switchStatus("all")}
              className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-[15px] ${
                statusFilter === "all"
                  ? "bg-tint text-white"
                  : "bg-card text-label"
              }`}
            >
              全部状态 {platformUnits.length}
            </button>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.status}
                type="button"
                aria-label={option.label}
                aria-pressed={statusFilter === option.status}
                onClick={() => switchStatus(option.status)}
                className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-[15px] ${
                  statusFilter === option.status
                    ? "bg-tint text-white"
                    : "bg-card text-label"
                }`}
              >
                {option.label}{" "}
                {
                  platformUnits.filter(
                    (unit) => unit.status === option.status,
                  ).length
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {loadError ? (
        <Card>
          <p role="alert" className="text-sm text-danger">{loadError}</p>
          <button type="button" onClick={load} className="mt-2 text-sm text-tint">
            重试
          </button>
        </Card>
      ) : loading ? (
        <InventorySkeleton />
      ) : units.length === 0 ? (
        <Card>
          <EmptyState title="暂无库存" subtitle="点底部“添加”录入第一件商品" />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            title="当前分类暂无商品"
            subtitle="请选择其他平台或状态"
          />
        </Card>
      ) : (
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {groups.map((group) => (
            <GroupCard
              key={group.key}
              group={group}
              imageUrl={imageUrls.get(group.product.id) ?? null}
              platformFilter={platformFilter}
              selectable={selecting}
              selected={group.units.every((unit) => selected.has(unit.id))}
              onToggle={() => toggleGroup(group)}
              onSettle={prepareSettlement}
            />
          ))}
        </div>
      )}

      {selecting && (
        <>
          <div aria-hidden="true" className="h-24" />
          <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 border-t border-separator bg-card p-3">
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              <span className="w-full text-center text-sm text-muted">
                已选 {selected.size} 件
              </span>
              {actionError && (
                <p
                  role="alert"
                  className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
                >
                  {actionError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!selected.size}
                  onClick={() => prepareShipping(chosen)}
                  className="min-h-11 rounded-xl bg-tint px-3 py-2.5 text-[15px] text-white disabled:opacity-40"
                >
                  批量寄出
                </button>
                <button
                  type="button"
                  disabled={!selected.size}
                  onClick={() => prepareSettlement(chosen)}
                  className="min-h-11 rounded-xl bg-[#1B7F37] px-3 py-2.5 text-[15px] text-white disabled:opacity-40"
                >
                  批量录到手价
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  aria-label="目标状态"
                  value={target}
                  onChange={(event) =>
                    setTarget(event.target.value as UnitStatus)
                  }
                  className="min-h-11 min-w-0 flex-1 rounded-xl bg-background px-3 text-[15px]"
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
                    if (target === "shipping") {
                      prepareShipping(chosen);
                      return;
                    }
                    if (
                      chosen.some(
                        (unit) =>
                          unit.status === "sold" || unit.status === "settled",
                      ) &&
                      !window.confirm(
                        "修改销售状态会删除或重置已有的销售和利润记录，确认继续？",
                      )
                    ) {
                      return;
                    }
                    setChangingStatus(true);
                    setActionError("");
                    try {
                      await batchChangeStatus(resolveDb(), chosen, target);
                      await done();
                    } catch (reason) {
                      setActionError(
                        reason instanceof Error
                          ? reason.message
                          : "状态修改失败",
                      );
                    } finally {
                      setChangingStatus(false);
                    }
                  }}
                  className="min-h-11 shrink-0 rounded-xl bg-label px-5 py-2.5 text-[15px] text-white disabled:opacity-40"
                >
                  {changingStatus
                    ? "处理中…"
                    : target === "shipping"
                      ? "填写运费"
                      : "修改状态"}
                </button>
              </div>
            </div>
          </div>
        </>
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
      {settlementUnits && (
        <SaleFormSheet
          units={settlementUnits}
          dataSource={dataSource}
          onClose={() => setSettlementUnits(null)}
          onDone={done}
        />
      )}
    </>
  );
}

function InventorySkeleton() {
  return (
    <div role="status" aria-label="正在加载库存" className="grid min-w-0 gap-3 md:grid-cols-2">
      <span className="sr-only">正在加载库存…</span>
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="flex min-w-0 animate-pulse gap-3 rounded-2xl bg-card p-4"
        >
          <div className="h-[72px] w-[72px] shrink-0 rounded-xl bg-separator" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-3/4 rounded bg-separator" />
            <div className="h-3 w-1/2 rounded bg-separator" />
            <div className="h-3 w-2/3 rounded bg-separator" />
          </div>
        </div>
      ))}
    </div>
  );
}
