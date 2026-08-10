"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import StatusChips from "@/components/ui/StatusChips";
import SaleFormSheet from "@/components/ui/SaleFormSheet";
import DeleteUnitSheet from "@/components/ui/DeleteUnitSheet";
import Sheet from "@/components/ui/Sheet";
import { getDb } from "@/lib/data";
import { changeUnitStatus, refundUnit } from "@/lib/services/status";
import { deleteUnitDeep } from "@/lib/services/maintenance";
import { formatCents, formatSignedCents } from "@/lib/utils/money";
import { unitProfit } from "@/lib/utils/profit";
import type { UnitJoined } from "@/lib/types/database";
import type { UnitStatus } from "@/lib/constants/status";

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
  const [unit, setUnit] = useState<UnitJoined | null>(null);
  const [error, setError] = useState("");
  const [sale, setSale] = useState(false);
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

  async function select(to: UnitStatus) {
    if (!unit) return;
    if (to === "settled") {
      setSale(true);
      return;
    }
    if (to === "refunded") {
      setRefund(true);
      return;
    }
    setBusy(true);
    try {
      await changeUnitStatus(getDb(), unit, to);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/inventory" className="text-tint">
        ‹ 库存
      </Link>
      <h1 className="mt-2 text-xl font-bold">{unit.product.name}</h1>
      <p className="text-sm text-muted">
        {unit.size} · {unit.product.style_code || "无货号"}
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
      <p className="mb-2 mt-5 text-sm text-muted">状态任意直达</p>
      <Card>
        <StatusChips current={unit.status} onSelect={select} />
        {busy && <p className="mt-2 text-center text-xs text-muted">处理中…</p>}
      </Card>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          onClick={() => setRefund(true)}
          className="rounded-xl bg-[#FFF3CD] py-3 text-sm text-[#8a6d00]"
        >
          采购退货退款
        </button>
        <button
          onClick={() => setDeleting(true)}
          className="rounded-xl bg-[#FFE5E5] py-3 text-sm text-[#FF3B30]"
        >
          删除此记录
        </button>
      </div>
      {error && <p className="mt-3 text-center text-sm text-[#FF3B30]">{error}</p>}
      {sale && (
        <SaleFormSheet
          units={[unit]}
          onClose={() => setSale(false)}
          onDone={async () => {
            setSale(false);
            await load();
          }}
        />
      )}
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
            try {
              await refundUnit(getDb(), unit.id, "采购平台退货退款");
              setRefund(false);
              await load();
            } finally {
              setBusy(false);
            }
          }}
          className="w-full rounded-xl bg-[#FF3B30] py-3 text-white"
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
