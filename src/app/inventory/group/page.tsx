"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import Sheet from "@/components/ui/Sheet";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusChips from "@/components/ui/StatusChips";
import SaleFormSheet from "@/components/ui/SaleFormSheet";
import { getDb } from "@/lib/data";
import { batchChangeStatus } from "@/lib/services/status";
import type { UnitStatus } from "@/lib/constants/status";
import { PLATFORM_LABELS } from "@/lib/constants/platform";
import { formatCny, formatDate, formatSignedCny } from "@/lib/utils/format";
import { daysInStatus, profitColor, round2, unitProfit } from "@/lib/utils/profit";
import type { StatusHistory, UnitJoined } from "@/lib/types/database";

export default function GroupPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-[13px] text-muted">加载中…</p>}>
      <GroupView />
    </Suspense>
  );
}

function GroupView() {
  const params = useSearchParams();
  const router = useRouter();
  const productId = params.get("product") ?? "";
  const size = params.get("size") ?? "";
  const cost = Number(params.get("cost") ?? 0);
  const status = params.get("status") as UnitStatus;

  const [units, setUnits] = useState<UnitJoined[]>([]);
  const [lastChange, setLastChange] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saleSheetOpen, setSaleSheetOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [message, setMessage] = useState("");

  const msgParam = params.get("msg");
  useEffect(() => {
    if (msgParam) queueMicrotask(() => setMessage(msgParam));
  }, [msgParam]);

  const load = useCallback(async () => {
    const db = getDb();
    const [allUnits, products, batches, sales, history] = await Promise.all([
      db.listUnits(),
      db.listProducts(),
      db.listBatches(),
      db.listSales(),
      db.listHistory(),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const batchMap = new Map(batches.map((b) => [b.id, b]));
    const saleMap = new Map(sales.map((s) => [s.unit_id, s]));

    const joined: UnitJoined[] = allUnits.flatMap((u) => {
      const product = productMap.get(u.product_id);
      const batch = batchMap.get(u.batch_id);
      if (!product || !batch) return [];
      return [{ ...u, product, batch, sale: saleMap.get(u.id) ?? null }];
    });

    setUnits(
      joined.filter(
        (u) =>
          u.product_id === productId &&
          u.size === size &&
          u.unit_cost === cost &&
          u.status === status,
      ),
    );

    const last: Record<string, string> = {};
    for (const h of history as StatusHistory[]) {
      if (!last[h.unit_id] || h.created_at > last[h.unit_id]) {
        last[h.unit_id] = h.created_at;
      }
    }
    setLastChange(last);
    setLoaded(true);
  }, [productId, size, cost, status]);

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

  /** 状态直达：状态变更后组 key 改变，跳转到新状态分组页 */
  function gotoNewGroup(to: UnitStatus, msg: string) {
    const q = [
      `product=${productId}`,
      `size=${encodeURIComponent(size)}`,
      `cost=${cost}`,
      `status=${to}`,
      `msg=${encodeURIComponent(msg)}`,
    ].join("&");
    router.replace(`/inventory/group?${q}`);
  }

  async function handleSelect(to: UnitStatus) {
    if (units.length === 0) return;
    if (to === "sold" || to === "settled") {
      setSaleSheetOpen(true);
      return;
    }
    if (to === "refunded") {
      setRefundOpen(true);
      return;
    }
    setBusy(true);
    const result = await batchChangeStatus(getDb(), units, to);
    setBusy(false);
    gotoNewGroup(
      to,
      result.failed.length === 0
        ? `已更新 ${result.ok} 件`
        : `成功 ${result.ok} 件，失败 ${result.failed.length} 件`,
    );
  }

  /** 数量调整：+1 复制最新一件；-1 删除最新一件 */
  async function adjustQuantity(delta: 1 | -1) {
    if (units.length === 0) return;
    if (delta === -1 && ["sold", "settled", "refunded"].includes(status)) {
      setMessage("已售/已结算/退款状态不支持减少数量");
      return;
    }
    setAdjusting(true);
    setMessage("");
    try {
      const db = getDb();
      const newest = [...units].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (delta === 1) {
        const created = await db.createUnits([
          {
            batch_id: newest.batch_id,
            product_id: newest.product_id,
            size: newest.size,
            unit_cost: newest.unit_cost,
            listing_price: newest.listing_price,
            status: newest.status,
          },
        ]);
        await db.addHistory([
          { unit_id: created[0].id, from_status: null, to_status: newest.status, note: "数量调整新增" },
        ]);
      } else {
        await db.deleteUnit(newest.id);
      }
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "调整失败");
    } finally {
      setAdjusting(false);
    }
  }

  if (!loaded) {
    return <p className="py-12 text-center text-[13px] text-muted">加载中…</p>;
  }
  if (units.length === 0) {
    return (
      <>
        <Link href="/inventory" className="text-[15px] text-tint">‹ 库存</Link>
        <Card className="mt-4">
          <p className="py-8 text-center text-[14px] text-muted">
            该分组暂无库存（可能状态已变更）
          </p>
        </Card>
      </>
    );
  }

  const product = units[0].product;
  const batch = units[0].batch;
  const totalProfit = round2(units.reduce((s, u) => s + (unitProfit(u, u.sale).value ?? 0), 0));
  const hasProfit = units.some((u) => u.sale != null);

  return (
    <>
      <Link href="/inventory" className="text-[15px] text-tint">‹ 库存</Link>

      <div className="mb-3 mt-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-[20px] font-bold leading-snug">{product.name}</h1>
          <StatusBadge status={status} />
        </div>
        <p className="mt-0.5 text-[13px] text-muted">
          {product.style_code || "无货号"} · {size} · {PLATFORM_LABELS[batch.platform]} ·
          单件成本 {formatCny(cost)}
        </p>
      </div>

      {/* 数量调整 */}
      <Card className="mb-3 flex items-center justify-between">
        <span className="text-[14px] text-muted">当前数量</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => adjustQuantity(-1)}
            disabled={adjusting}
            aria-label="减少一件"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-[20px] leading-none text-label active:bg-separator disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-[28px] text-center text-[20px] font-bold">{units.length}</span>
          <button
            type="button"
            onClick={() => adjustQuantity(1)}
            disabled={adjusting}
            aria-label="增加一件"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-[20px] leading-none text-label active:bg-separator disabled:opacity-40"
          >
            +
          </button>
        </div>
      </Card>

      {hasProfit && (
        <Card className="mb-3 flex items-center justify-between">
          <span className="text-[14px] text-muted">组内利润合计</span>
          <span className="text-[17px] font-bold" style={{ color: profitColor(totalProfit) }}>
            {formatSignedCny(totalProfit)}
          </span>
        </Card>
      )}

      {/* 全组状态直达 */}
      <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">
        全组变更状态（应用于 {units.length} 件）
      </p>
      <Card>
        <StatusChips current={status} onSelect={handleSelect} />
        {busy && <p className="mt-2 text-center text-[12px] text-muted">变更中…</p>}
      </Card>

      {/* 组内单件 */}
      <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">组内单件（{units.length}）</p>
      <div className="space-y-2">
        {[...units]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((u, i) => {
            const p = unitProfit(u, u.sale);
            return (
              <Link
                key={u.id}
                href={`/inventory/${u.id}`}
                className="flex items-center justify-between rounded-xl bg-card px-3.5 py-3 text-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-background"
              >
                <span>
                  #{i + 1}
                  <span className="ml-2 text-[12px] text-muted">
                    {formatDate(u.created_at)} 入库 · 状态 {daysInStatus(u, lastChange[u.id] ?? null)} 天
                    {u.batch.order_no ? ` · ${u.batch.order_no}` : ""}
                  </span>
                </span>
                <span className="font-semibold" style={{ color: profitColor(p.value) }}>
                  {p.value != null ? formatSignedCny(p.value) : "—"}
                </span>
              </Link>
            );
          })}
      </div>

      {message && (
        <p
          className={`mt-3 text-center text-[13px] ${
            /失败|不支持|错误|不存在/.test(message) ? "text-[#FF3B30]" : "text-[#1d7a35]"
          }`}
        >
          {message}
        </p>
      )}
      <div className="h-6" />

      {/* 全组销售登记 */}
      {saleSheetOpen && (
        <SaleFormSheet
          units={units}
          existingSale={units[0].sale}
          onClose={() => setSaleSheetOpen(false)}
          onDone={(msg, to) => {
            setSaleSheetOpen(false);
            gotoNewGroup(to, msg);
          }}
        />
      )}

      {/* 全组退款确认 */}
      <Sheet open={refundOpen} title={`全组转为退款（${units.length} 件）`} onClose={() => setRefundOpen(false)}>
        <div className="space-y-3 pb-1">
          <p className="text-[14px] leading-relaxed text-muted">
            转为「退款」后，结算数据将被清除、不再计入利润；之后可随时转回「得物仓未售」重新销售。
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await batchChangeStatus(getDb(), units, "refunded");
              setBusy(false);
              setRefundOpen(false);
              gotoNewGroup(
                "refunded",
                result.failed.length === 0
                  ? `已更新 ${result.ok} 件`
                  : `成功 ${result.ok} 件，失败 ${result.failed.length} 件`,
              );
            }}
            className="w-full rounded-xl bg-[#FF3B30] py-3 text-[16px] font-medium text-white active:opacity-80 disabled:opacity-40"
          >
            {busy ? "处理中…" : "确认转为退款"}
          </button>
          <button
            type="button"
            onClick={() => setRefundOpen(false)}
            className="w-full rounded-xl bg-background py-3 text-[15px] text-label"
          >
            取消
          </button>
        </div>
      </Sheet>
    </>
  );
}
