"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import UnitCard from "@/components/ui/UnitCard";
import GroupCard from "@/components/ui/GroupCard";
import { BoxIcon, SearchIcon } from "@/components/ui/icons";
import { getDb } from "@/lib/data";
import { batchChangeStatus } from "@/lib/services/status";
import { daysInStatus, unitProfit, type ProfitResult } from "@/lib/utils/profit";
import { buildGroups } from "@/lib/utils/group";
import {
  STATUS_FILTER_GROUPS,
  STATUS_META,
  UNIT_STATUSES,
  type UnitStatus,
} from "@/lib/constants/status";
import { PLATFORMS, type Platform } from "@/lib/constants/platform";
import type {
  Attachment,
  StatusHistory,
  UnitJoined,
} from "@/lib/types/database";
import Sheet from "@/components/ui/Sheet";
import SaleFormSheet from "@/components/ui/SaleFormSheet";

type SortKey = "purchased_at" | "profit" | "days";

const selectCls =
  "rounded-xl bg-card px-2.5 py-2 text-[13px] text-label shadow-[0_1px_2px_rgba(0,0,0,0.05)] outline-none";

export default function InventoryPage() {
  const [units, setUnits] = useState<UnitJoined[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [lastChange, setLastChange] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [statusGroup, setStatusGroup] = useState(0); // 0 = 全部
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [size, setSize] = useState("all");
  const [sort, setSort] = useState<SortKey>("purchased_at");

  const [merged, setMerged] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchMsg, setBatchMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchTarget, setBatchTarget] = useState<UnitStatus>("arrived");
  const [saleSheetUnits, setSaleSheetUnits] = useState<UnitJoined[] | null>(null);
  const [batchRefundOpen, setBatchRefundOpen] = useState(false);

  const load = useCallback(async () => {
    const db = getDb();
    const [units, products, batches, sales, history] = await Promise.all([
      db.listUnits(),
      db.listProducts(),
      db.listBatches(),
      db.listSales(),
      db.listHistory(),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const batchMap = new Map(batches.map((b) => [b.id, b]));
    const saleMap = new Map(sales.map((s) => [s.unit_id, s]));

    const joined: UnitJoined[] = units.flatMap((u) => {
      const product = productMap.get(u.product_id);
      const batch = batchMap.get(u.batch_id);
      if (!product || !batch) return [];
      return [{ ...u, product, batch, sale: saleMap.get(u.id) ?? null }];
    });
    setUnits(joined);

    const last: Record<string, string> = {};
    for (const h of history as StatusHistory[]) {
      if (!last[h.unit_id] || h.created_at > last[h.unit_id]) {
        last[h.unit_id] = h.created_at;
      }
    }
    setLastChange(last);

    const productIds = [...new Set(joined.map((u) => u.product_id))];
    const entries = await Promise.all(
      productIds.map(async (pid) => {
        const atts: Attachment[] = await db.listAttachments("product", pid);
        const img = atts.find((a) => a.kind === "product_image");
        if (!img) return [pid, ""] as const;
        return [pid, await db.attachmentUrl(img)] as const;
      }),
    );
    setImages(Object.fromEntries(entries));
    setLoaded(true);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const sizes = useMemo(
    () => [...new Set(units.map((u) => u.size))].sort(),
    [units],
  );

  const profitOf = (u: UnitJoined): ProfitResult => unitProfit(u, u.sale);
  const daysOf = (u: UnitJoined): number => daysInStatus(u, lastChange[u.id] ?? null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = units.filter((u) => {
      if (q) {
        const hay = [u.product.name, u.product.style_code ?? "", u.batch.order_no ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusGroup > 0) {
        const group = STATUS_FILTER_GROUPS[statusGroup - 1];
        if (!group.statuses.includes(u.status)) return false;
      }
      if (platform !== "all" && u.batch.platform !== platform) return false;
      if (size !== "all" && u.size !== size) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sort === "purchased_at") {
        return (
          b.batch.purchased_at.localeCompare(a.batch.purchased_at) ||
          b.created_at.localeCompare(a.created_at)
        );
      }
      if (sort === "profit") {
        return (profitOf(b).value ?? -Infinity) - (profitOf(a).value ?? -Infinity);
      }
      return daysOf(b) - daysOf(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, search, statusGroup, platform, size, sort, lastChange]);

  /** 合并分组（组排序取组内最优值） */
  const groups = useMemo(() => {
    const gs = buildGroups(filtered);
    return [...gs].sort((a, b) => {
      if (sort === "profit") {
        const pa = a.units.reduce((s, u) => s + (profitOf(u).value ?? -Infinity), 0);
        const pb = b.units.reduce((s, u) => s + (profitOf(u).value ?? -Infinity), 0);
        return pb - pa;
      }
      if (sort === "days") {
        return Math.max(...b.units.map(daysOf)) - Math.max(...a.units.map(daysOf));
      }
      const da = a.units[0]?.batch.purchased_at ?? "";
      const db = b.units[0]?.batch.purchased_at ?? "";
      return db.localeCompare(da);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, lastChange]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chosenUnits = units.filter((u) => selected.has(u.id));

  /** 批量执行：sold/settled 弹销售表单；refunded 弹确认；其余直接改 */
  async function runBatch() {
    if (chosenUnits.length === 0) return;
    if (batchTarget === "sold" || batchTarget === "settled") {
      setSaleSheetUnits(chosenUnits);
      return;
    }
    if (batchTarget === "refunded") {
      setBatchRefundOpen(true);
      return;
    }
    await executeBatch(batchTarget);
  }

  async function executeBatch(to: UnitStatus) {
    setBusy(true);
    const result = await batchChangeStatus(getDb(), chosenUnits, to);
    setBatchMsg(
      result.failed.length === 0
        ? `已更新 ${result.ok} 件`
        : `成功 ${result.ok} 件，失败 ${result.failed.length} 件`,
    );
    setBusy(false);
    setSelectMode(false);
    setSelected(new Set());
    await load();
  }

  const showMerged = merged && !selectMode;

  return (
    <>
      <div className="flex items-start justify-between">
        <PageHeader title="库存" subtitle={loaded ? `共 ${units.length} 件` : undefined} />
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => setMerged((m) => !m)}
            className={`rounded-full px-3 py-1.5 text-[12px] ${
              merged ? "bg-label font-medium text-card" : "bg-card text-label shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            }`}
          >
            合并
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectMode((s) => !s);
              setSelected(new Set());
              setBatchMsg("");
            }}
            className={`rounded-full px-3 py-1.5 text-[12px] ${
              selectMode ? "bg-tint font-medium text-white" : "bg-card text-label shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            }`}
          >
            {selectMode ? "取消" : "批量"}
          </button>
        </div>
      </div>

      {/* 搜索：货号 / 品名 / 订单号 */}
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#e9e9eb] px-3 py-2">
        <SearchIcon size={17} className="shrink-0 text-muted" />
        <input
          className="w-full bg-transparent text-[16px] outline-none placeholder:text-muted"
          placeholder="搜索品名 / 货号 / 订单号"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 状态筛选 */}
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {["全部", ...STATUS_FILTER_GROUPS.map((g) => g.label)].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusGroup(i)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] ${
              statusGroup === i
                ? "bg-label font-medium text-card"
                : "bg-card text-label shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 平台 / 尺码 / 排序 */}
      <div className="mb-4 flex gap-2">
        <select className={selectCls} value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "all")}>
          <option value="all">全部平台</option>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <select className={selectCls} value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="all">全部尺码</option>
          {sizes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className={`${selectCls} ml-auto`} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="purchased_at">按采购日期</option>
          <option value="profit">按预计利润</option>
          <option value="days">按停留天数</option>
        </select>
      </div>

      {batchMsg && (
        <p className="mb-3 rounded-xl bg-[#E8F9EE] px-3 py-2 text-center text-[13px] text-[#1d7a35]">
          {batchMsg}
        </p>
      )}

      {/* 列表 */}
      {!loaded ? (
        <p className="py-12 text-center text-[13px] text-muted">加载中…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BoxIcon size={40} strokeWidth={1.4} />}
            title={units.length === 0 ? "暂无库存" : "没有符合条件的商品"}
            subtitle={units.length === 0 ? "点底部「添加」录入第一件商品" : "试试调整筛选条件"}
          />
        </Card>
      ) : showMerged ? (
        <div className="space-y-2.5">
          {groups.map((g) => {
            const profitSum = g.units.reduce((s, u) => s + (profitOf(u).value ?? 0), 0);
            const anyProfit = g.units.some((u) => profitOf(u).value != null);
            return (
              <GroupCard
                key={g.key}
                group={g}
                imageUrl={images[g.product.id] || null}
                profitSum={anyProfit ? profitSum : null}
                maxDays={Math.max(...g.units.map(daysOf))}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((u) => (
            <UnitCard
              key={u.id}
              unit={u}
              imageUrl={images[u.product_id] || null}
              profit={profitOf(u)}
              statusDays={daysOf(u)}
              selectable={selectMode}
              selected={selected.has(u.id)}
              onToggle={() => toggleSelect(u.id)}
            />
          ))}
        </div>
      )}

      {/* 批量操作固定栏 */}
      {selectMode && (
        <>
          <div className="h-24" />
          <div className="fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-40 border-t border-separator bg-card/95 backdrop-blur">
            <div className="mx-auto max-w-lg px-4 py-2.5">
              <p className="mb-2 text-center text-[12px] text-muted">
                {selected.size === 0 ? "点卡片左上角圆圈选择商品" : `已选 ${selected.size} 件`}
              </p>
              <div className="flex gap-2">
                <select
                  className="min-w-0 flex-1 rounded-xl bg-background px-3 py-2.5 text-[14px] outline-none"
                  value={batchTarget}
                  onChange={(e) => setBatchTarget(e.target.value as UnitStatus)}
                >
                  {UNIT_STATUSES.map((s) => (
                    <option key={s} value={s}>改为：{STATUS_META[s].label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={runBatch}
                  className="shrink-0 rounded-xl bg-tint px-6 py-2.5 text-[14px] font-medium text-white active:opacity-80 disabled:opacity-40"
                >
                  {busy ? "执行中…" : "执行"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 批量销售登记 */}
      {saleSheetUnits && (
        <SaleFormSheet
          units={saleSheetUnits}
          existingSale={saleSheetUnits[0]?.sale}
          onClose={() => setSaleSheetUnits(null)}
          onDone={async (msg) => {
            setSaleSheetUnits(null);
            setBatchMsg(msg);
            setSelectMode(false);
            setSelected(new Set());
            await load();
          }}
        />
      )}

      {/* 批量退款确认 */}
      <Sheet open={batchRefundOpen} title={`批量转为退款（${chosenUnits.length} 件）`} onClose={() => setBatchRefundOpen(false)}>
        <div className="space-y-3 pb-1">
          <p className="text-[14px] leading-relaxed text-muted">
            转为「退款」后，结算数据将被清除、不再计入利润；之后可随时转回「得物仓未售」重新销售。
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBatchRefundOpen(false);
              await executeBatch("refunded");
            }}
            className="w-full rounded-xl bg-[#FF3B30] py-3 text-[16px] font-medium text-white active:opacity-80 disabled:opacity-40"
          >
            确认转为退款
          </button>
          <button
            type="button"
            onClick={() => setBatchRefundOpen(false)}
            className="w-full rounded-xl bg-background py-3 text-[15px] text-label"
          >
            取消
          </button>
        </div>
      </Sheet>
    </>
  );
}
