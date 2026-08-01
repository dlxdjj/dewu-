"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Sheet from "@/components/ui/Sheet";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusChips from "@/components/ui/StatusChips";
import SaleFormSheet from "@/components/ui/SaleFormSheet";
import Timeline from "@/components/ui/Timeline";
import { BoxIcon } from "@/components/ui/icons";
import { getDb } from "@/lib/data";
import { changeUnitStatus, revertUnitStatus } from "@/lib/services/status";
import { STATUS_META, type UnitStatus } from "@/lib/constants/status";
import { PLATFORM_LABELS } from "@/lib/constants/platform";
import {
  formatCny,
  formatDate,
  formatSignedCny,
} from "@/lib/utils/format";
import {
  daysInStatus,
  profitColor,
  round2,
  unitProfit,
} from "@/lib/utils/profit";
import type {
  Attachment,
  StatusHistory,
  UnitJoined,
} from "@/lib/types/database";

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [data, setData] = useState<{
    unit: UnitJoined;
    history: StatusHistory[];
    images: { url: string; att: Attachment }[];
    batchMates: UnitJoined[];
    lastChange: Record<string, string>;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saleSheetOpen, setSaleSheetOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

    const join = (u: (typeof units)[number]): UnitJoined | null => {
      const product = productMap.get(u.product_id);
      const batch = batchMap.get(u.batch_id);
      if (!product || !batch) return null;
      return { ...u, product, batch, sale: saleMap.get(u.id) ?? null };
    };

    const raw = units.find((u) => u.id === id);
    const unit = raw ? join(raw) : null;
    if (!unit) {
      setNotFound(true);
      return;
    }

    const batchMates = units
      .filter((u) => u.batch_id === unit.batch_id && u.id !== unit.id)
      .map(join)
      .filter((u): u is UnitJoined => u != null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    const last: Record<string, string> = {};
    for (const h of history) {
      if (!last[h.unit_id] || h.created_at > last[h.unit_id]) {
        last[h.unit_id] = h.created_at;
      }
    }

    const atts = [
      ...(await db.listAttachments("product", unit.product_id)),
      ...(await db.listAttachments("batch", unit.batch_id)),
    ];
    const images = await Promise.all(
      atts.map(async (att) => ({ att, url: await db.attachmentUrl(att) })),
    );

    setData({
      unit,
      history: history.filter((h) => h.unit_id === id),
      images: images.filter((i) => i.url),
      batchMates,
      lastChange: last,
    });
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } catch {
        if (alive) setNotFound(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  /** 状态直达：sold/settled 弹销售表单；refunded 弹确认；其余直接变更 */
  async function handleSelect(to: UnitStatus) {
    if (!data) return;
    if (to === "sold" || to === "settled") {
      setSaleSheetOpen(true);
      return;
    }
    if (to === "refunded") {
      setRefundOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await changeUnitStatus(getDb(), data.unit, to);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <>
        <Link href="/inventory" className="text-[15px] text-tint">‹ 库存</Link>
        <Card className="mt-4">
          <p className="py-8 text-center text-[14px] text-muted">未找到该库存记录</p>
        </Card>
      </>
    );
  }

  if (!data) {
    return <p className="py-12 text-center text-[13px] text-muted">加载中…</p>;
  }

  const { unit, history, images, batchMates, lastChange } = data;
  const { product, batch, sale } = unit;
  const profit = unitProfit(unit, sale);
  const lastWithFrom = [...history].reverse().find((h) => h.from_status);

  // 批次汇总
  const allInBatch = [unit, ...batchMates];
  const batchTotalCost = round2(allInBatch.reduce((s, u) => s + u.unit_cost, 0));
  const batchSoldCount = allInBatch.filter((u) => u.status === "sold" || u.status === "settled").length;
  const batchProfit = round2(
    allInBatch.reduce((s, u) => s + (unitProfit(u, u.sale).value ?? 0), 0),
  );

  return (
    <>
      <Link href="/inventory" className="text-[15px] text-tint">‹ 库存</Link>

      {/* 头部：图片 + 基本信息 */}
      <div className="mb-3 mt-2 flex gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card text-muted shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          {images.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[0].url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <BoxIcon size={28} strokeWidth={1.4} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-bold leading-snug">{product.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {product.style_code || "无货号"} · {unit.size} ·{" "}
            {PLATFORM_LABELS[batch.platform]}
          </p>
          <div className="mt-1.5"><StatusBadge status={unit.status} /></div>
        </div>
      </div>

      {/* 变更状态（状态直达） */}
      <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">变更状态（点选即改）</p>
      <Card>
        <StatusChips current={unit.status} onSelect={handleSelect} />
        {busy && <p className="mt-2 text-center text-[12px] text-muted">变更中…</p>}
      </Card>

      {/* 成本 */}
      <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">采购成本</p>
      <Card className="space-y-1.5 text-[14px]">
        <Row label="采购单价" value={formatCny(batch.unit_price)} />
        <Row label="批次运费 / 优惠" value={`${formatCny(batch.shipping_fee)} / ${formatCny(batch.discount_amount)}`} />
        <Row label="采购日期" value={formatDate(batch.purchased_at)} />
        <Row label="采购平台" value={PLATFORM_LABELS[batch.platform]} />
        {batch.order_no && <Row label="订单号" value={batch.order_no} />}
        <div className="my-1 border-t border-separator" />
        <Row label="分摊后单件成本" value={formatCny(unit.unit_cost)} strong />
      </Card>

      {/* 销售与利润 */}
      {sale && (
        <>
          <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">销售与利润</p>
          <Card className="space-y-1.5 text-[14px]">
            <Row label="得物售价" value={formatCny(sale.sold_price)} />
            <Row label="平台费用" value={formatCny(sale.platform_fee)} />
            <Row label="平台补贴" value={formatCny(sale.platform_subsidy)} />
            <Row label="快递费" value={formatCny(sale.express_fee)} />
            <Row label="其他费用" value={formatCny(sale.other_fee)} />
            <Row label="实际到账" value={formatCny(sale.actual_payout)} />
            <Row label="售出 / 结算日期" value={`${formatDate(sale.sold_at)} / ${formatDate(sale.settled_at)}`} />
            <div className="my-1 border-t border-separator" />
            <div className="flex items-center justify-between">
              <span className="text-muted">
                {profit.kind === "actual" ? "实际利润" : "预计利润"}
              </span>
              <span
                className="text-[18px] font-bold"
                style={{ color: profitColor(profit.value) }}
              >
                {formatSignedCny(profit.value)}
              </span>
            </div>
          </Card>
        </>
      )}

      {/* 同批次 */}
      <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">
        同批次（共 {allInBatch.length} 件）
      </p>
      <Card>
        <p className="pb-2 text-[13px] text-muted">
          总成本 {formatCny(batchTotalCost)} · 已售 {batchSoldCount} 件 · 批次利润{" "}
          <span className="font-semibold" style={{ color: profitColor(batchSoldCount ? batchProfit : null) }}>
            {batchSoldCount ? formatSignedCny(batchProfit) : "—"}
          </span>
        </p>
        {batchMates.length > 0 && (
          <div className="divide-y divide-separator border-t border-separator">
            {batchMates.map((m, i) => (
              <Link
                key={m.id}
                href={`/inventory/${m.id}`}
                className="flex items-center justify-between py-2.5"
              >
                <span className="text-[14px]">
                  #{i + 2}
                  <span className="ml-2 text-[12px] text-muted">
                    状态 {daysInStatus(m, lastChange[m.id] ?? null)} 天
                  </span>
                </span>
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* 附件 */}
      {images.length > 0 && (
        <>
          <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">图片附件</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map(({ att, url }) => (
              <a key={att.id} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={att.kind === "order_screenshot" ? "订单截图" : "商品图"}
                  className="h-20 w-20 rounded-xl object-cover"
                />
              </a>
            ))}
          </div>
        </>
      )}

      {/* 状态时间轴 */}
      <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">状态时间轴</p>
      <Card>
        <Timeline history={history} />
      </Card>

      {/* 状态回退 */}
      {lastWithFrom && unit.status !== "refunded" && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => { setError(""); setRevertOpen(true); }}
            className="w-full rounded-xl bg-card py-3 text-[15px] text-muted shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-background"
          >
            回退到上一状态（{STATUS_META[lastWithFrom.from_status!].label}）
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-center text-[13px] text-[#FF3B30]">{error}</p>}
      <div className="h-6" />

      {/* 销售登记表单（sold/settled） */}
      {saleSheetOpen && (
        <SaleFormSheet
          units={[unit]}
          existingSale={sale}
          onClose={() => setSaleSheetOpen(false)}
          onDone={async () => {
            setSaleSheetOpen(false);
            await load();
          }}
        />
      )}

      {/* 退款确认 */}
      <Sheet open={refundOpen} title="转为退款" onClose={() => setRefundOpen(false)}>
        <div className="space-y-3 pb-1">
          <p className="text-[14px] leading-relaxed text-muted">
            转为「退款」后，该件的结算数据将被清除（售价记录保留），且不再计入利润。
            之后可随时转回「得物仓未售」重新销售。
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await changeUnitStatus(getDb(), unit, "refunded");
                setRefundOpen(false);
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "操作失败");
                setRefundOpen(false);
              } finally {
                setBusy(false);
              }
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

      {/* 回退确认 */}
      <Sheet open={revertOpen} title="回退状态" onClose={() => setRevertOpen(false)}>
        <div className="space-y-3 pb-1">
          <p className="text-[14px] leading-relaxed text-muted">
            将从「{STATUS_META[unit.status].label}」回退到上一状态。
            {(unit.status === "sold" || unit.status === "settled") && (
              <span className="block pt-1 text-[#FF3B30]">
                注意：结算数据将被清除；回退到非销售状态时销售记录将被删除。
              </span>
            )}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await revertUnitStatus(getDb(), unit);
                setRevertOpen(false);
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "回退失败");
                setRevertOpen(false);
              } finally {
                setBusy(false);
              }
            }}
            className="w-full rounded-xl bg-tint py-3 text-[16px] font-medium text-white active:opacity-80 disabled:opacity-40"
          >
            {busy ? "回退中…" : "确认回退"}
          </button>
          <button
            type="button"
            onClick={() => setRevertOpen(false)}
            className="w-full rounded-xl bg-background py-3 text-[15px] text-label"
          >
            取消
          </button>
        </div>
      </Sheet>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted">{label}</span>
      <span className={`truncate ${strong ? "text-[16px] font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
