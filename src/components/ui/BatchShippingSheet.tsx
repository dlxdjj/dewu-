"use client";

import { useMemo, useState } from "react";
import Sheet from "./Sheet";
import type { InventoryUnit } from "@/lib/types/database";
import { previewShipping } from "@/lib/services/shipping";
import { todayStr } from "@/lib/utils/format";
import { formatCents, normalizeMoneyInput } from "@/lib/utils/money";

export default function BatchShippingSheet({
  units,
  onClose,
  onConfirm,
}: {
  units: InventoryUnit[];
  onClose: () => void;
  onConfirm: (
    totalShippingCents: number,
    mode: "append" | "replace",
    shippedAt: string,
  ) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [shippedAt, setShippedAt] = useState(todayStr);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const single = units.length === 1;
  const preview = useMemo(() => {
    try {
      return amount ? previewShipping(units, amount) : null;
    } catch {
      return null;
    }
  }, [amount, units]);

  return (
    <Sheet
      open
      title={single ? "寄出并录入运费" : `批量寄出（${units.length} 件）`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <label className="block text-sm">
          {single ? "寄出快递费（元，必填）" : "总快递费（元，必填）"}
          <input
            aria-label={single ? "寄出快递费" : "总快递费"}
            required
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(normalizeMoneyInput(event.target.value));
            }}
            className="mt-1 w-full rounded-xl bg-background px-3 py-3 text-base"
            placeholder="0.00"
          />
        </label>

        <label className="block min-w-0 text-sm">
          寄出日期（必填）
          <span className="date-input-shell mt-1">
            <input
              aria-label="寄出日期"
              required
              type="date"
              value={shippedAt}
              onChange={(event) => setShippedAt(event.target.value)}
              className="mobile-date-input"
            />
          </span>
        </label>

        {preview?.hasOverwrite && (
          <fieldset>
            <legend className="text-sm">这批商品已有历史运费</legend>
            <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-background p-1">
              <button
                type="button"
                aria-pressed={mode === "append"}
                onClick={() => setMode("append")}
                className={`min-h-11 rounded-lg text-sm ${mode === "append" ? "bg-card font-medium shadow-sm" : "text-muted"}`}
              >
                追加本次运费
              </button>
              <button
                type="button"
                aria-pressed={mode === "replace"}
                onClick={() => setMode("replace")}
                className={`min-h-11 rounded-lg text-sm ${mode === "replace" ? "bg-card font-medium shadow-sm" : "text-muted"}`}
              >
                纠正累计运费
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-muted">
              {mode === "append"
                ? "保留过去运费，把本次金额继续计入成本和本月运费。"
                : "用本次金额替换所选商品的累计运费，旧流水作废但保留审计记录。"}
            </p>
          </fieldset>
        )}

        {preview && (
          <div className="rounded-xl bg-background p-3 text-sm">
            <p>
              {single ? "本件运费" : "分摊合计"}：
              {formatCents(preview.totalShippingCents)}
            </p>
            {!single && (
              <div className="mt-2 max-h-28 overflow-y-auto text-sm text-muted">
                {preview.allocations.map((item, index) => (
                  <p key={item.unitId}>
                    第 {index + 1} 件：{formatCents(item.shippingCents)}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-2 text-sm text-muted">
              确认后状态将改为“发往得物途中”，运费会从利润中扣除。
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!preview || busy || !shippedAt}
          onClick={async () => {
            if (!preview) return;
            setBusy(true);
            setError("");
            try {
              await onConfirm(preview.totalShippingCents, mode, shippedAt);
            } catch (reason: unknown) {
              setError(reason instanceof Error ? reason.message : "寄出失败");
            } finally {
              setBusy(false);
            }
          }}
          className="w-full rounded-xl bg-tint py-3 text-[15px] font-medium text-white disabled:opacity-40"
        >
          {busy
            ? "提交中…"
            : single
              ? "确认运费并寄出"
              : "确认寄出并均摊"}
        </button>
      </div>
    </Sheet>
  );
}
