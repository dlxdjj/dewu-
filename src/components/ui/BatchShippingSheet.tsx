"use client";

import { useMemo, useState } from "react";
import Sheet from "./Sheet";
import type { InventoryUnit } from "@/lib/types/database";
import { previewShipping } from "@/lib/services/shipping";
import { formatCents } from "@/lib/utils/money";

export default function BatchShippingSheet({
  units,
  onClose,
  onConfirm,
}: {
  units: InventoryUnit[];
  onClose: () => void;
  onConfirm: (
    totalShippingCents: number,
    overwriteConfirmed: boolean,
  ) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [overwrite, setOverwrite] = useState(false);
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
              setAmount(event.target.value);
              setOverwrite(false);
            }}
            className="mt-1 w-full rounded-xl bg-background px-3 py-3 text-base"
            placeholder="0.00"
          />
        </label>

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

        {preview?.hasOverwrite && !overwrite && (
          <button
            type="button"
            onClick={() => setOverwrite(true)}
            className="w-full rounded-xl bg-[#FFF3CD] py-3 text-sm text-[#8a6d00]"
          >
            确认覆盖原运费
          </button>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!preview || busy || (preview.hasOverwrite && !overwrite)}
          onClick={async () => {
            if (!preview) return;
            setBusy(true);
            setError("");
            try {
              await onConfirm(preview.totalShippingCents, overwrite);
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
