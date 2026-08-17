"use client";

import { useMemo, useState } from "react";
import { NEXT_ACTION_LABEL, STATUS_META, type UnitStatus } from "@/lib/constants/status";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import { shipUnits } from "@/lib/services/shipping";
import { batchChangeStatus, refundUnit } from "@/lib/services/status";
import type { UnitJoined } from "@/lib/types/database";
import BatchShippingSheet from "./BatchShippingSheet";
import SaleFormSheet from "./SaleFormSheet";
import Sheet from "./Sheet";

export function workflowActionLabel(units: UnitJoined[]): string {
  const actionable = units.filter((unit) => NEXT_ACTION_LABEL[unit.status]);
  if (!actionable.length) return "查看记录";
  const statuses = new Set(actionable.map((unit) => unit.status));
  if (statuses.size !== 1) return `处理下一步 · ${actionable.length} 件`;
  const status = actionable[0].status;
  return `${NEXT_ACTION_LABEL[status]}${actionable.length > 1 ? ` · ${actionable.length} 件` : ""}`;
}

export default function UnitWorkflowSheet({
  units,
  dataSource,
  onClose,
  onDone,
}: {
  units: UnitJoined[];
  dataSource?: DbAdapter;
  onClose: () => void;
  onDone: (message: string) => Promise<void> | void;
}) {
  const buckets = useMemo(() => groupByStatus(units), [units]);
  const [activeStatus, setActiveStatus] = useState<UnitStatus | null>(() =>
    buckets.length === 1 ? buckets[0].status : null,
  );
  const [mode, setMode] = useState<"action" | "shipping">("action");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeUnits = activeStatus
    ? buckets.find((bucket) => bucket.status === activeStatus)?.units ?? []
    : [];
  const db = dataSource ?? getDb();

  async function finish(message: string): Promise<void> {
    await onDone(message);
  }

  async function advance(to: UnitStatus, message: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      await batchChangeStatus(db, activeUnits, to, { note: message });
      await finish(`${message} ${activeUnits.length} 件`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  if (!activeStatus) {
    return (
      <Sheet open title={`处理下一步（${units.length} 件）`} onClose={onClose}>
        <p className="mb-3 text-sm leading-6 text-muted">
          所选商品状态不同，请按当前状态分别处理。
        </p>
        <div className="space-y-2">
          {buckets.map((bucket) => {
            const label = NEXT_ACTION_LABEL[bucket.status];
            if (!label) return null;
            return (
              <button
                key={bucket.status}
                type="button"
                onClick={() => setActiveStatus(bucket.status)}
                className="flex min-h-14 w-full items-center justify-between rounded-xl bg-background px-4 text-left"
              >
                <span>
                  <span className="block text-[15px] font-medium">{label}</span>
                  <span className="block text-xs text-muted">当前：{STATUS_META[bucket.status].label}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold">{bucket.units.length} 件</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }

  if (mode === "shipping" || activeStatus === "arrived") {
    return (
      <BatchShippingSheet
        units={activeUnits}
        onClose={onClose}
        onConfirm={async (totalShippingCents, shippingMode, shippedAt) => {
          await shipUnits(db, {
            unitIds: activeUnits.map((unit) => unit.id),
            totalShippingCents,
            mode: shippingMode,
            shippedAt,
          });
          await finish(`已寄出 ${activeUnits.length} 件并记录运费`);
        }}
      />
    );
  }

  if (activeStatus === "in_stock_dewu") {
    return (
      <SaleFormSheet
        units={activeUnits}
        dataSource={dataSource}
        allowPending
        onClose={onClose}
        onDone={(message) => finish(message)}
      />
    );
  }

  if (activeStatus === "sold" || activeStatus === "settled") {
    return (
      <SaleFormSheet
        units={activeUnits}
        dataSource={dataSource}
        onClose={onClose}
        onDone={(message) => finish(message)}
      />
    );
  }

  if (activeStatus === "refunded") {
    return (
      <Sheet open title="退货退款记录" onClose={onClose}>
        <p className="text-sm leading-6 text-muted">这些商品已经完成采购退款，状态不能继续修改。</p>
        <button type="button" onClick={onClose} className="mt-3 min-h-12 w-full rounded-xl bg-label text-card">关闭</button>
      </Sheet>
    );
  }

  const title = NEXT_ACTION_LABEL[activeStatus] ?? STATUS_META[activeStatus].label;
  return (
    <Sheet open title={title} onClose={onClose}>
      {buckets.length > 1 && (
        <button
          type="button"
          onClick={() => {
            setActiveStatus(null);
            setError("");
          }}
          className="mb-3 min-h-11 text-sm text-tint"
        >
          ‹ 返回按状态处理
        </button>
      )}

      {activeStatus === "pending" && (
        <ActionConfirmation
          count={activeUnits.length}
          description="确认商品已经到货。完成后，下一步可以录入运费并寄往得物。"
          buttonLabel="确认已经到货"
          busy={busy}
          error={error}
          onConfirm={() => advance("arrived", "确认到货")}
        />
      )}

      {activeStatus === "shipping" && (
        <ActionConfirmation
          count={activeUnits.length}
          description="确认得物已经签收并入仓。完成后，这批商品会进入得物仓未售库存。"
          buttonLabel="确认已经入仓"
          busy={busy}
          error={error}
          onConfirm={() => advance("in_stock_dewu", "确认入仓")}
        />
      )}

      {activeStatus === "returned" && (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted">
            退回商品可以重新寄往得物；采购退款需要逐件确认，避免误删销售记录。
          </p>
          <button
            type="button"
            onClick={() => setMode("shipping")}
            className="min-h-12 w-full rounded-xl bg-tint font-medium text-white"
          >
            重新寄往得物
          </button>
          {activeUnits.length === 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await refundUnit(db, activeUnits[0].id, "退回后采购退款");
                  await finish("采购退款已完成");
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : "退款失败");
                } finally {
                  setBusy(false);
                }
              }}
              className="min-h-12 w-full rounded-xl bg-danger/10 font-medium text-danger disabled:opacity-40"
            >
              确认采购退款
            </button>
          ) : (
            <p className="rounded-xl bg-background px-3 py-2.5 text-xs leading-5 text-muted">
              多件商品如需采购退款，请进入商品单件列表逐件确认。
            </p>
          )}
          {error && <p role="alert" className="text-center text-sm text-danger">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

function ActionConfirmation({
  count,
  description,
  buttonLabel,
  busy,
  error,
  onConfirm,
}: {
  count: number;
  description: string;
  buttonLabel: string;
  busy: boolean;
  error: string;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-background px-3 py-2.5 text-sm leading-6 text-muted">
        将处理 {count} 件商品。{description}
      </p>
      {error && <p role="alert" className="text-center text-sm text-danger">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="min-h-12 w-full rounded-xl bg-tint font-medium text-white disabled:opacity-40"
      >
        {busy ? "处理中…" : `${buttonLabel}${count > 1 ? ` · ${count} 件` : ""}`}
      </button>
    </div>
  );
}

function groupByStatus(units: UnitJoined[]): { status: UnitStatus; units: UnitJoined[] }[] {
  const map = new Map<UnitStatus, UnitJoined[]>();
  for (const unit of units) {
    map.set(unit.status, [...(map.get(unit.status) ?? []), unit]);
  }
  return [...map.entries()].map(([status, rows]) => ({ status, units: rows }));
}
