"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import GroupCard from "@/components/ui/GroupCard";
import PageHeader from "@/components/ui/PageHeader";
import Sheet from "@/components/ui/Sheet";
import UnitWorkflowSheet, {
  workflowActionLabel,
} from "@/components/ui/UnitWorkflowSheet";
import { useAppData } from "@/components/AppDataProvider";
import { loadProductImageUrls } from "@/lib/catalog";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/constants/platform";
import {
  ACTIVE_STATUSES,
  STATUS_META,
  type UnitStatus,
} from "@/lib/constants/status";
import { getDb } from "@/lib/data";
import type {
  DbAdapter,
  InventoryGroupPageRow,
  InventoryPageResult,
  InventorySort,
  InventoryView,
} from "@/lib/data/types";
import type { UnitJoined } from "@/lib/types/database";
import type { PlatformFilter, StatusFilter } from "@/lib/utils/group";

const PAGE_SIZE = 20;
const EMPTY_COUNTS: InventoryPageResult["counts"] = {
  active: 0,
  settlement: 0,
  sales: 0,
  refunds: 0,
};
const VIEWS: { value: InventoryView; label: string; status: UnitStatus | null }[] = [
  { value: "active", label: "当前库存", status: null },
  { value: "settlement", label: "待结算", status: "sold" },
  { value: "sales", label: "销售记录", status: "settled" },
  { value: "refunds", label: "退货退款", status: "refunded" },
];
const SORTS: { value: InventorySort; label: string; salesOnly?: boolean }[] = [
  { value: "purchase_desc", label: "采购日期：新到旧" },
  { value: "purchase_asc", label: "采购日期：旧到新" },
  { value: "cost_desc", label: "成本：高到低" },
  { value: "cost_asc", label: "成本：低到高" },
  { value: "profit_desc", label: "利润：高到低", salesOnly: true },
  { value: "profit_asc", label: "利润：低到高", salesOnly: true },
];

export default function InventoryPage({
  dataSource,
}: {
  dataSource?: DbAdapter;
} = {}) {
  const [groups, setGroups] = useState<InventoryGroupPageRow[]>([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [platforms, setPlatforms] = useState<InventoryPageResult["availablePlatforms"]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [view, setView] = useState<InventoryView>("active");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<InventorySort>("purchase_desc");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [missingSizeOnly, setMissingSizeOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [workflowUnits, setWorkflowUnits] = useState<UnitJoined[] | null>(null);
  const imageUrlsRef = useRef<Map<string, string>>(new Map());
  const pendingImageIdsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);
  const shared = useAppData();
  const bulk = !dataSource && shared?.data?.preferences.workflow === "bulk";
  const resolveDb = useCallback(
    (): DbAdapter => dataSource ?? getDb(),
    [dataSource],
  );

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
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPage = useCallback(async (
    offset: number,
    replace: boolean,
  ): Promise<void> => {
    if (!dataSource && shared && !shared.data) {
      setLoading(shared.loading);
      setLoadError(shared.error);
      return;
    }
    const version = ++requestVersionRef.current;
    if (replace) setLoading(true);
    else setLoadingMore(true);
    setLoadError("");
    try {
      const result = await resolveDb().listInventoryGroupsPage({
        view,
        status: statusFilter,
        platform: bulk ? "all" : platformFilter,
        query: deferredQuery,
        missingSizeOnly,
        sort,
        limit: PAGE_SIZE,
        offset,
      });
      if (!mountedRef.current || version !== requestVersionRef.current) return;
      setGroups((current) => replace ? result.groups : [...current, ...result.groups]);
      setCounts(result.counts);
      setTotalGroups(result.totalGroups);
      setTotalUnits(result.totalUnits);
      setPlatforms(result.availablePlatforms);
    } catch (reason) {
      if (version === requestVersionRef.current) {
        setLoadError(reason instanceof Error ? reason.message : "加载失败");
      }
    } finally {
      if (version === requestVersionRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [
    bulk,
    dataSource,
    deferredQuery,
    missingSizeOnly,
    platformFilter,
    resolveDb,
    shared,
    sort,
    statusFilter,
    view,
  ]);

  useEffect(() => {
    if (!initialized) return;
    void Promise.resolve().then(() => loadPage(0, true));
  }, [initialized, loadPage]);

  const visibleProducts = useMemo(
    () => [...new Map(groups.map((group) => [group.product.id, group.product])).values()],
    [groups],
  );

  useEffect(() => {
    const missing = visibleProducts.filter(
      (product) =>
        !imageUrlsRef.current.has(product.id) &&
        !pendingImageIdsRef.current.has(product.id),
    );
    if (!missing.length) return;
    for (const product of missing) pendingImageIdsRef.current.add(product.id);
    void loadProductImageUrls(resolveDb(), missing, (productId, url) => {
      imageUrlsRef.current.set(productId, url);
      pendingImageIdsRef.current.delete(productId);
      if (mountedRef.current) setImageUrls(new Map(imageUrlsRef.current));
    }).finally(() => {
      for (const product of missing) pendingImageIdsRef.current.delete(product.id);
    });
  }, [resolveDb, visibleProducts]);

  const availablePlatforms = PLATFORMS.filter(
    (option) => !bulk && platforms.includes(option.value),
  );
  const pageUnits = groups.flatMap((group) => group.units);
  const chosen = pageUnits.filter((unit) => selected.has(unit.id));
  const canBatch = view === "active" || view === "settlement";
  const hasAnyData = Object.values(counts).some((count) => count > 0);
  const hasMore = groups.length < totalGroups;
  const activeFilterCount =
    Number(!bulk && platformFilter !== "all") +
    Number(view === "active" && statusFilter !== "all") +
    Number(missingSizeOnly) +
    Number(sort !== "purchase_desc");
  const pageTitle = view === "active"
    ? "库存"
    : VIEWS.find((item) => item.value === view)?.label ?? "库存";

  function resetSelection(): void {
    setSelecting(false);
    setSelected(new Set());
  }

  function switchView(next: InventoryView): void {
    setView(next);
    setStatusFilter("all");
    setSort("purchase_desc");
    resetSelection();
  }

  function toggleGroup(group: InventoryGroupPageRow): void {
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

  async function done(message: string): Promise<void> {
    setWorkflowUnits(null);
    setNotice(message);
    resetSelection();
    await shared?.refresh();
    await loadPage(0, true);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={pageTitle}
          subtitle={loading ? "加载中…" : `${totalUnits} 件 · ${totalGroups} 款`}
        />
        {canBatch && counts[view] > 0 && (
          <button
            type="button"
            onClick={() => selecting ? resetSelection() : setSelecting(true)}
            className="min-h-11 shrink-0 rounded-full border border-separator bg-card px-4 text-[15px] shadow-[var(--cirrus-shadow-1)]"
          >
            {selecting ? "退出批量" : "批量操作"}
          </button>
        )}
      </div>

      <nav
        aria-label="库存分类"
        className="mb-4 grid grid-cols-2 gap-1 rounded-[28px] border border-separator bg-card p-1 shadow-[var(--cirrus-shadow-1)]"
      >
        {VIEWS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={view === item.value}
            onClick={() => switchView(item.value)}
            className={`min-h-11 rounded-full px-3 text-[15px] transition-colors ${
              view === item.value
                ? "bg-label text-card shadow-[var(--cirrus-shadow-2)]"
                : "text-muted"
            }`}
          >
            {item.label} {counts[item.value]}
          </button>
        ))}
      </nav>

      {notice && (
        <p role="status" aria-live="polite" className="mb-3 rounded-xl bg-card px-3 py-2 text-center text-sm text-muted shadow-[var(--cirrus-shadow-1)]">
          {notice}
        </p>
      )}

      {!loading && hasAnyData && (
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
          {!bulk && platformFilter !== "all" && (
            <button onClick={() => setPlatformFilter("all")} className="rounded-full bg-tint/10 px-3 py-1.5 text-tint">
              {PLATFORM_LABELS[platformFilter]} ×
            </button>
          )}
          {missingSizeOnly && (
            <button onClick={() => setMissingSizeOnly(false)} className="rounded-full bg-tint/10 px-3 py-1.5 text-tint">
              待补尺码 ×
            </button>
          )}
          {view === "active" && statusFilter !== "all" && (
            <button onClick={() => setStatusFilter("all")} className="rounded-full bg-tint/10 px-3 py-1.5 text-tint">
              {STATUS_META[statusFilter].label} ×
            </button>
          )}
          {sort !== "purchase_desc" && (
            <button onClick={() => setSort("purchase_desc")} className="rounded-full bg-tint/10 px-3 py-1.5 text-tint">
              {SORTS.find((item) => item.value === sort)?.label} ×
            </button>
          )}
        </div>
      )}

      {loadError ? (
        <Card>
          <p role="alert" className="text-sm text-danger">{loadError}</p>
          <button type="button" onClick={() => void loadPage(0, true)} className="mt-2 text-sm text-tint">重试</button>
        </Card>
      ) : loading ? (
        <InventorySkeleton />
      ) : !hasAnyData ? (
        <Card><EmptyState title="暂无商品" subtitle="点底部“添加”录入第一件商品" /></Card>
      ) : groups.length === 0 ? (
        <Card><EmptyState title="没有匹配结果" subtitle="尝试清空搜索或调整筛选条件" /></Card>
      ) : (
        <>
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {groups.map((group, index) => (
              <GroupCard
                key={group.key}
                group={group}
                imageUrl={imageUrls.get(group.product.id) ?? null}
                imagePriority={index < 3}
                profitCents={
                  view === "sales" ? group.profitCents
                    : view === "settlement" ? null
                      : undefined
                }
                platformFilter={platformFilter}
                selectable={selecting}
                selected={group.units.every((unit) => selected.has(unit.id))}
                onToggle={() => toggleGroup(group)}
                onProcess={view === "refunds" ? undefined : setWorkflowUnits}
                statusScope={
                  view === "active"
                    ? statusFilter === "all" ? "active" : statusFilter
                    : VIEWS.find((item) => item.value === view)?.status
                }
                showPlatform={!bulk}
              />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadPage(groups.length, false)}
              className="mt-4 min-h-12 w-full rounded-full border border-separator bg-card font-medium text-tint shadow-[var(--cirrus-shadow-1)] disabled:opacity-50"
            >
              {loadingMore ? "加载中…" : `加载更多（剩余 ${totalGroups - groups.length} 款）`}
            </button>
          )}
        </>
      )}

      {selecting && (
        <>
          <div aria-hidden="true" className="h-32" />
          <div className="fixed inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-3xl rounded-[28px] border border-separator bg-card p-3 shadow-[var(--cirrus-shadow-2)]">
            <div className="flex flex-col gap-2">
              <span className="text-center text-sm text-muted">已选 {selected.size} 件</span>
              <button
                type="button"
                disabled={!selected.size}
                onClick={() => setWorkflowUnits(chosen)}
                className="min-h-12 w-full rounded-xl bg-label px-4 text-[15px] font-medium text-card disabled:opacity-40"
              >
                {selected.size ? workflowActionLabel(chosen) : "请先选择商品"}
              </button>
            </div>
          </div>
        </>
      )}

      <Sheet open={filterOpen} title="筛选与排序" onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm text-muted">排序</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SORTS.filter((item) => !item.salesOnly || view === "sales").map((item) => (
                <FilterButton key={item.value} active={sort === item.value} onClick={() => setSort(item.value)}>
                  {item.label}
                </FilterButton>
              ))}
            </div>
          </fieldset>
          {!bulk && (
            <fieldset>
              <legend className="text-sm text-muted">采购平台</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <FilterButton active={platformFilter === "all"} onClick={() => setPlatformFilter("all")}>全部</FilterButton>
                {availablePlatforms.map((option) => (
                  <FilterButton key={option.value} active={platformFilter === option.value} onClick={() => setPlatformFilter(option.value)}>
                    {option.label}
                  </FilterButton>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className="text-sm text-muted">尺码资料</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <FilterButton active={!missingSizeOnly} onClick={() => setMissingSizeOnly(false)}>全部尺码</FilterButton>
              <FilterButton active={missingSizeOnly} onClick={() => setMissingSizeOnly(true)}>待补尺码</FilterButton>
            </div>
          </fieldset>
          {view === "active" && (
            <fieldset>
              <legend className="text-sm text-muted">库存状态</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>全部当前库存</FilterButton>
                {ACTIVE_STATUSES.map((status) => (
                  <FilterButton key={status} active={statusFilter === status} onClick={() => setStatusFilter(status)}>
                    {STATUS_META[status].label}
                  </FilterButton>
                ))}
              </div>
            </fieldset>
          )}
          <button type="button" onClick={() => setFilterOpen(false)} className="min-h-12 w-full rounded-xl bg-tint font-medium text-white">查看结果</button>
        </div>
      </Sheet>

      {workflowUnits && (
        <UnitWorkflowSheet
          units={workflowUnits}
          dataSource={dataSource}
          onClose={() => setWorkflowUnits(null)}
          onDone={done}
        />
      )}
    </>
  );
}

function FilterButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-xl px-2 text-sm ${active ? "bg-label text-card" : "bg-background"}`}
    >
      {children}
    </button>
  );
}

function InventorySkeleton() {
  return (
    <div role="status" aria-label="正在加载库存" className="grid min-w-0 gap-3 md:grid-cols-2">
      <span className="sr-only">正在加载库存…</span>
      {[0, 1, 2, 3].map((item) => (
        <div key={item} aria-hidden="true" className="flex animate-pulse gap-3 rounded-2xl bg-card p-4">
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
