"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BatchShippingSheet from "@/components/ui/BatchShippingSheet";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import GroupCard from "@/components/ui/GroupCard";
import PageHeader from "@/components/ui/PageHeader";
import SaleFormSheet from "@/components/ui/SaleFormSheet";
import Sheet from "@/components/ui/Sheet";
import { useAppData } from "@/components/AppDataProvider";
import { loadProductImageUrls } from "@/lib/catalog";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/constants/platform";
import {
  ACTIVE_STATUSES,
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
  type PlatformFilter,
  type StatusFilter,
  type UnitGroup,
} from "@/lib/utils/group";

type InventoryView = "active" | "settlement" | "sales" | "refunds";

const VIEWS: { value: InventoryView; label: string; status: UnitStatus | null }[] = [
  { value: "active", label: "当前库存", status: null },
  { value: "settlement", label: "待结算", status: "sold" },
  { value: "sales", label: "销售记录", status: "settled" },
  { value: "refunds", label: "退货退款", status: "refunded" },
];

export default function InventoryPage({
  dataSource,
}: {
  dataSource?: DbAdapter;
} = {}) {
  const [units, setUnits] = useState<UnitJoined[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [view, setView] = useState<InventoryView>("active");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [shipping, setShipping] = useState(false);
  const [settlementUnits, setSettlementUnits] = useState<UnitJoined[] | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [target, setTarget] = useState<UnitStatus>("arrived");
  const shared = useAppData();

  const resolveDb = useCallback((): DbAdapter => dataSource ?? getDb(), [dataSource]);

  const load = useCallback(async () => {
    if (!dataSource && shared && !shared.data) {
      setLoading(shared.loading);
      setLoadError(shared.error);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const db = resolveDb();
      const [raw, products, batches, sales] = !dataSource && shared?.data
        ? [shared.data.units, shared.data.products, shared.data.batches, shared.data.sales]
        : await Promise.all([db.listUnits(), db.listProducts(), db.listBatches(), db.listSales()]);
      const productMap = new Map(products.map((row) => [row.id, row]));
      const batchMap = new Map(batches.map((row) => [row.id, row]));
      const saleMap = new Map(sales.map((row) => [row.unit_id, row]));
      const joined = raw.flatMap((unit): UnitJoined[] => {
        const product = productMap.get(unit.product_id);
        const batch = batchMap.get(unit.batch_id);
        return product && batch
          ? [{ ...unit, product, batch, sale: saleMap.get(unit.id) ?? null }]
          : [];
      });
      setUnits(joined);
      // Show cached inventory immediately; signed thumbnails can arrive afterward.
      setLoading(false);
      setImageUrls(await loadProductImageUrls(
        db,
        new Set(joined.map((unit) => unit.product_id)),
      ));
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [dataSource, resolveDb, shared]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const requestedStatus = params.get("status") as UnitStatus | null;
    queueMicrotask(() => {
      if (VIEWS.some((item) => item.value === requestedView)) {
        setView(requestedView as InventoryView);
      }
      if (requestedStatus && ACTIVE_STATUSES.includes(requestedStatus)) {
        setStatusFilter(requestedStatus);
      }
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const viewCounts = useMemo(() => ({
    active: units.filter((unit) => ACTIVE_STATUSES.includes(unit.status)).length,
    settlement: units.filter((unit) => unit.status === "sold").length,
    sales: units.filter((unit) => unit.status === "settled").length,
    refunds: units.filter((unit) => unit.status === "refunded").length,
  }), [units]);

  const visibleUnits = useMemo(() => {
    const fixedStatus = VIEWS.find((item) => item.value === view)?.status;
    const needle = query.trim().toLocaleLowerCase();
    return units.filter((unit) => {
      const inView = fixedStatus
        ? unit.status === fixedStatus
        : ACTIVE_STATUSES.includes(unit.status);
      if (!inView) return false;
      if (view === "active" && statusFilter !== "all" && unit.status !== statusFilter) {
        return false;
      }
      if (platformFilter !== "all" && unit.batch.platform !== platformFilter) return false;
      if (!needle) return true;
      return [
        unit.product.name,
        unit.product.style_code,
        unit.size,
        unit.batch.order_no,
        PLATFORM_LABELS[unit.batch.platform],
      ].some((value) => value?.toLocaleLowerCase().includes(needle));
    });
  }, [platformFilter, query, statusFilter, units, view]);

  const groups = buildGroups(visibleUnits);
  const availablePlatforms = PLATFORMS.filter((option) =>
    units.some((unit) => unit.batch.platform === option.value),
  );
  const chosen = units.filter((unit) => selected.has(unit.id));
  const canBatch = view === "active" || view === "settlement";
  const activeFilterCount =
    Number(platformFilter !== "all") + Number(view === "active" && statusFilter !== "all");

  function resetSelection(): void {
    setSelecting(false);
    setSelected(new Set());
    setActionError("");
  }

  function switchView(next: InventoryView): void {
    setView(next);
    setStatusFilter("all");
    resetSelection();
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
    resetSelection();
    if (!dataSource && shared) await shared.refresh();
    else await load();
  }

  function prepareShipping(candidates: UnitJoined[]): void {
    setActionError("");
    if (!candidates.length) return;
    if (candidates.some((unit) => unit.status === "sold" || unit.status === "settled") &&
      !window.confirm("重新寄出会删除所选商品已有的销售和利润记录，确认继续？")) return;
    setShipping(true);
  }

  function prepareSettlement(candidates: UnitJoined[]): void {
    if (!candidates.length) return;
    setActionError("");
    setSettlementUnits(candidates);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="库存" subtitle={loading ? "加载中…" : `${visibleUnits.length} 件 · ${groups.length} 款`} />
        {canBatch && units.length > 0 && (
          <button
            type="button"
            onClick={() => selecting ? resetSelection() : setSelecting(true)}
            className="min-h-11 shrink-0 rounded-full border border-separator bg-card px-4 text-[15px] shadow-[var(--cirrus-shadow-1)]"
          >
            {selecting ? "退出批量" : "批量操作"}
          </button>
        )}
      </div>

      <nav aria-label="库存分类" className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-full border border-separator bg-card p-1 shadow-[var(--cirrus-shadow-1)]">
        {VIEWS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={view === item.value}
            onClick={() => switchView(item.value)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-[15px] transition-colors ${
              view === item.value ? "bg-label text-card shadow-[var(--cirrus-shadow-2)]" : "text-muted"
            }`}
          >
            {item.label} {viewCounts[item.value]}
          </button>
        ))}
      </nav>

      {!loading && units.length > 0 && (
        <div className="mb-3 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索库存</span>
            <input
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索品名、货号、尺码、订单号"
              className="min-h-12 w-full min-w-0 rounded-full border border-separator bg-card px-4 text-base shadow-[var(--cirrus-shadow-1)] outline-none placeholder:text-muted"
            />
          </label>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="min-h-12 shrink-0 rounded-full border border-separator bg-card px-4 text-[15px] shadow-[var(--cirrus-shadow-1)]"
          >
            筛选{activeFilterCount ? ` ${activeFilterCount}` : ""}
          </button>
        </div>
      )}

      {activeFilterCount > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {platformFilter !== "all" && (
            <button onClick={() => setPlatformFilter("all")} className="rounded-full bg-tint/10 px-3 py-1.5 text-tint">
              {PLATFORM_LABELS[platformFilter]} ×
            </button>
          )}
          {view === "active" && statusFilter !== "all" && (
            <button onClick={() => setStatusFilter("all")} className="rounded-full bg-tint/10 px-3 py-1.5 text-tint">
              {STATUS_META[statusFilter].label} ×
            </button>
          )}
        </div>
      )}

      {loadError ? (
        <Card>
          <p role="alert" className="text-sm text-danger">{loadError}</p>
          <button type="button" onClick={load} className="mt-2 text-sm text-tint">重试</button>
        </Card>
      ) : loading ? (
        <InventorySkeleton />
      ) : units.length === 0 ? (
        <Card><EmptyState title="暂无商品" subtitle="点底部“添加”录入第一件商品" /></Card>
      ) : groups.length === 0 ? (
        <Card><EmptyState title="没有匹配结果" subtitle="尝试清空搜索或调整筛选条件" /></Card>
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
              onSettle={view === "settlement" ? prepareSettlement : undefined}
              statusScope={
                view === "active"
                  ? statusFilter === "all" ? "active" : statusFilter
                  : VIEWS.find((item) => item.value === view)?.status
              }
            />
          ))}
        </div>
      )}

      {selecting && (
        <>
          <div aria-hidden="true" className="h-32" />
          <div className="fixed inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-3xl rounded-[28px] border border-separator bg-card p-3 shadow-[var(--cirrus-shadow-2)]">
            <div className="flex flex-col gap-2">
              <span className="text-center text-sm text-muted">已选 {selected.size} 件</span>
              {actionError && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button disabled={!selected.size} onClick={() => prepareShipping(chosen)} className="min-h-11 rounded-xl bg-tint text-[15px] text-white disabled:opacity-40">批量寄出</button>
                <button disabled={!selected.size} onClick={() => prepareSettlement(chosen)} className="min-h-11 rounded-xl bg-label text-[15px] text-white disabled:opacity-40">批量录到手价</button>
              </div>
              <div className="flex gap-2">
                <select aria-label="目标状态" value={target} onChange={(event) => setTarget(event.target.value as UnitStatus)} className="min-h-11 min-w-0 flex-1 rounded-xl bg-background px-3 text-[15px]">
                  {BATCH_STATUS_TARGETS.map((status) => <option key={status} value={status}>{STATUS_META[status].label}</option>)}
                </select>
                <button
                  type="button"
                  disabled={!selected.size || changingStatus}
                  onClick={async () => {
                    if (target === "shipping") return prepareShipping(chosen);
                    if (chosen.some((unit) => unit.status === "sold" || unit.status === "settled") &&
                      !window.confirm("修改销售状态会删除或重置已有的销售和利润记录，确认继续？")) return;
                    setChangingStatus(true);
                    setActionError("");
                    try { await batchChangeStatus(resolveDb(), chosen, target); await done(); }
                    catch (reason) { setActionError(reason instanceof Error ? reason.message : "状态修改失败"); }
                    finally { setChangingStatus(false); }
                  }}
                  className="min-h-11 shrink-0 rounded-xl bg-label px-5 text-[15px] text-white disabled:opacity-40"
                >
                  {changingStatus ? "处理中…" : target === "shipping" ? "填写运费" : "修改状态"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <Sheet open={filterOpen} title="筛选库存" onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm text-muted">采购平台</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <FilterButton active={platformFilter === "all"} onClick={() => setPlatformFilter("all")}>全部</FilterButton>
              {availablePlatforms.map((option) => <FilterButton key={option.value} active={platformFilter === option.value} onClick={() => setPlatformFilter(option.value)}>{option.label}</FilterButton>)}
            </div>
          </fieldset>
          {view === "active" && (
            <fieldset>
              <legend className="text-sm text-muted">库存状态</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>全部当前库存</FilterButton>
                {ACTIVE_STATUSES.map((status) => <FilterButton key={status} active={statusFilter === status} onClick={() => setStatusFilter(status)}>{STATUS_META[status].label}</FilterButton>)}
              </div>
            </fieldset>
          )}
          <button type="button" onClick={() => setFilterOpen(false)} className="min-h-12 w-full rounded-xl bg-tint font-medium text-white">查看结果</button>
        </div>
      </Sheet>

      {shipping && (
        <BatchShippingSheet
          units={chosen}
          onClose={() => setShipping(false)}
          onConfirm={async (total, mode, shippedAt) => {
            await shipUnits(resolveDb(), { unitIds: chosen.map((unit) => unit.id), totalShippingCents: total, mode, shippedAt });
            await done();
          }}
        />
      )}
      {settlementUnits && <SaleFormSheet units={settlementUnits} dataSource={dataSource} onClose={() => setSettlementUnits(null)} onDone={done} />}
    </>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-11 rounded-xl px-2 text-sm ${active ? "bg-label text-card" : "bg-background"}`}>{children}</button>;
}

function InventorySkeleton() {
  return (
    <div role="status" aria-label="正在加载库存" className="grid min-w-0 gap-3 md:grid-cols-2">
      <span className="sr-only">正在加载库存…</span>
      {[0, 1, 2, 3].map((item) => (
        <div key={item} aria-hidden="true" className="flex animate-pulse gap-3 rounded-2xl bg-card p-4">
          <div className="h-[72px] w-[72px] shrink-0 rounded-xl bg-separator" />
          <div className="flex-1 space-y-2 py-1"><div className="h-4 w-3/4 rounded bg-separator" /><div className="h-3 w-1/2 rounded bg-separator" /><div className="h-3 w-2/3 rounded bg-separator" /></div>
        </div>
      ))}
    </div>
  );
}
