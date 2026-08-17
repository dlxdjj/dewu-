"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import DeleteUnitSheet from "@/components/ui/DeleteUnitSheet";
import Sheet from "@/components/ui/Sheet";
import UnitWorkflowSheet from "@/components/ui/UnitWorkflowSheet";
import { useAppData } from "@/components/AppDataProvider";
import { getDb } from "@/lib/data";
import { changeUnitStatus, refundUnit } from "@/lib/services/status";
import { deleteUnitDeep } from "@/lib/services/maintenance";
import { formatCents, formatSignedCents } from "@/lib/utils/money";
import { unitProfit } from "@/lib/utils/profit";
import type { UnitJoined } from "@/lib/types/database";
import {
  CORRECTION_STATUS_TARGETS,
  NEXT_ACTION_LABEL,
  STATUS_META,
  type UnitStatus,
} from "@/lib/constants/status";

export default function DetailPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Detail />
    </Suspense>
  );
}

function LoadingCard() {
  return (
    <Card className="mt-4">
      <p className="text-sm text-muted">加载中…</p>
    </Card>
  );
}

function Detail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const router = useRouter();
  const shared = useAppData();
  const [unit, setUnit] = useState<UnitJoined | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workflow, setWorkflow] = useState(false);
  const [more, setMore] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<UnitStatus>("arrived");
  const [refund, setRefund] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const db = getDb();
    const [units, products, batches, sales] = await Promise.all([
      db.listUnits(),
      db.listProducts(),
      db.listBatches(),
      db.listSales(),
    ]);
    const raw = units.find((item) => item.id === id);
    if (!raw) throw new Error("库存不存在");
    const product = products.find((item) => item.id === raw.product_id);
    const batch = batches.find((item) => item.id === raw.batch_id);
    if (!product || !batch) throw new Error("关联资料不存在");
    setUnit({
      ...raw,
      product,
      batch,
      sale: sales.find((item) => item.unit_id === id) ?? null,
    });
  }, [id]);

  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "加载失败"),
      );
  }, [load]);

  if (!unit) {
    return (
      <>
        <Link href="/inventory" className="text-tint">
          ‹ 库存
        </Link>
        <Card className="mt-4">
          <p className="text-sm text-muted">{error || "加载中…"}</p>
        </Card>
      </>
    );
  }

  const profit = unitProfit(unit, unit.sale);

  return (
    <>
      <Link href="/inventory" className="text-tint">
        ‹ 库存
      </Link>
      <h1 className="mt-2 text-xl font-bold">{unit.product.name}</h1>
      <p className="text-sm text-muted">
        {unit.size || "待补尺码"} · {unit.product.style_code || "无货号"}
      </p>
      <Card className="mt-4 space-y-2 text-sm">
        <Row label="单件进价" value={formatCents(unit.unit_cost_cents)} />
        <Row
          label="均摊寄出快递费"
          value={formatCents(unit.outbound_shipping_cents)}
        />
        <Row
          label="实际到手价"
          value={
            unit.sale?.actual_payout_cents == null
              ? "未结算"
              : formatCents(unit.sale.actual_payout_cents)
          }
        />
        <Row label="实际利润" value={formatSignedCents(profit.value)} />
      </Card>
      <Card className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">当前状态</span>
          <span className="rounded-full bg-background px-3 py-1.5 text-sm font-medium">
            {STATUS_META[unit.status].label}
          </span>
        </div>
        {NEXT_ACTION_LABEL[unit.status] && (
          <button
            type="button"
            onClick={() => setWorkflow(true)}
            className="mt-4 min-h-12 w-full rounded-xl bg-label text-[15px] font-medium text-card"
          >
            {NEXT_ACTION_LABEL[unit.status]}
          </button>
        )}
      </Card>
      <button
        type="button"
        onClick={() => setMore(true)}
        className="mt-4 min-h-12 w-full rounded-xl border border-separator bg-card text-sm text-muted"
      >
        更多操作
      </button>
      {notice && (
        <p role="status" aria-live="polite" className="mt-3 text-center text-sm text-muted">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-danger">
          {error}
        </p>
      )}
      {workflow && (
        <UnitWorkflowSheet
          units={[unit]}
          onClose={() => setWorkflow(false)}
          onDone={async (message) => {
            setWorkflow(false);
            setNotice(message);
            await shared?.refresh();
            await load();
          }}
        />
      )}
      <Sheet open={more} title="更多操作" onClose={() => setMore(false)}>
        <div className="space-y-2">
          {unit.status !== "refunded" && (
            <button
              type="button"
              onClick={() => {
                const fallback = CORRECTION_STATUS_TARGETS.find((status) => status !== unit.status) ?? "arrived";
                setCorrectionTarget(fallback);
                setMore(false);
                setCorrecting(true);
              }}
              className="min-h-12 w-full rounded-xl bg-background text-[15px]"
            >
              纠正库存状态
            </button>
          )}
          {unit.status !== "refunded" && (
            <button
              type="button"
              onClick={() => {
                setMore(false);
                setRefund(true);
              }}
              className="min-h-12 w-full rounded-xl bg-danger/10 text-[15px] text-danger"
            >
              采购退货退款
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMore(false);
              setDeleting(true);
            }}
            className="min-h-12 w-full rounded-xl bg-danger/10 text-[15px] text-danger"
          >
            删除此记录
          </button>
        </div>
      </Sheet>
      <Sheet open={correcting} title="纠正库存状态" onClose={() => setCorrecting(false)}>
        <p className="mb-3 text-sm leading-6 text-muted">
          只在之前误操作时使用。纠正销售相关状态可能删除或重置到手价和利润记录。
        </p>
        <label className="block text-sm">
          目标状态
          <select
            aria-label="纠正后的状态"
            value={correctionTarget}
            onChange={(event) => setCorrectionTarget(event.target.value as UnitStatus)}
            className="mt-1 min-h-12 w-full rounded-xl bg-background px-3 text-base"
          >
            {CORRECTION_STATUS_TARGETS.filter((status) => status !== unit.status).map((status) => (
              <option key={status} value={status}>{STATUS_META[status].label}</option>
            ))}
          </select>
        </label>
        {error && <p role="alert" className="mt-3 text-center text-sm text-danger">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`确认把状态纠正为“${STATUS_META[correctionTarget].label}”？`)) return;
            setBusy(true);
            setError("");
            try {
              await changeUnitStatus(getDb(), unit, correctionTarget, {
                allowCorrection: true,
                note: `手动纠正为${STATUS_META[correctionTarget].label}`,
              });
              setCorrecting(false);
              setNotice(`状态已纠正为${STATUS_META[correctionTarget].label}`);
              await shared?.refresh();
              await load();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "状态纠正失败");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 min-h-12 w-full rounded-xl bg-label text-card disabled:opacity-40"
        >
          {busy ? "处理中…" : "确认纠正状态"}
        </button>
      </Sheet>
      <Sheet
        open={refund}
        title="采购退货退款"
        onClose={() => setRefund(false)}
      >
        <p className="mb-3 text-sm leading-6 text-muted">
          保留进价和退款历史，删除销售结算；退款件不计库存、销量或利润。
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await refundUnit(getDb(), unit.id, "采购平台退货退款");
              setRefund(false);
              setNotice("采购退款已完成");
              await shared?.refresh();
              await load();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "退款失败");
            } finally {
              setBusy(false);
            }
          }}
          className="w-full rounded-xl bg-danger py-3 text-white"
        >
          确认采购退款
        </button>
      </Sheet>
      {deleting && (
        <DeleteUnitSheet
          unit={unit}
          busy={busy}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const result = await deleteUnitDeep(getDb(), unit.id);
              if (result.pendingStoragePaths.length) {
                sessionStorage.setItem(
                  "pms_cleanup_notice",
                  `${result.pendingStoragePaths.length} 个附件待清理`,
                );
              }
              await shared?.refresh();
              router.replace("/inventory");
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "删除失败");
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
