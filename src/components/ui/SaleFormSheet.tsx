"use client";

import { useState } from "react";
import Sheet from "./Sheet";
import Field, { inputCls, moneyInputProps } from "./Field";
import { getDb } from "@/lib/data";
import { batchChangeStatus } from "@/lib/services/status";
import { todayStr } from "@/lib/utils/format";
import type { InventoryUnit, Sale } from "@/lib/types/database";

/**
 * 统一销售登记表单（选「已售待结算 / 已结算」时使用）：
 * - 不开「已到账」→ 已售待结算
 * - 开「已到账」→ 直接已结算（售出与回款一次登记）
 */
export default function SaleFormSheet({
  units,
  existingSale,
  onClose,
  onDone,
}: {
  units: InventoryUnit[];
  existingSale?: Sale | null;
  onClose: () => void;
  onDone: (message: string, to: "sold" | "settled") => Promise<void> | void;
}) {
  const [soldPrice, setSoldPrice] = useState(existingSale?.sold_price?.toString() ?? "");
  const [platformFee, setPlatformFee] = useState(existingSale?.platform_fee?.toString() ?? "");
  const [subsidy, setSubsidy] = useState(existingSale?.platform_subsidy?.toString() ?? "");
  const [expressFee, setExpressFee] = useState(existingSale?.express_fee?.toString() ?? "");
  const [otherFee, setOtherFee] = useState(existingSale?.other_fee?.toString() ?? "");
  const [soldAt, setSoldAt] = useState(existingSale?.sold_at ?? todayStr());
  const [paid, setPaid] = useState(existingSale?.actual_payout != null);
  const [payout, setPayout] = useState(existingSale?.actual_payout?.toString() ?? "");
  const [settledAt, setSettledAt] = useState(existingSale?.settled_at ?? todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const many = units.length > 1;

  async function submit() {
    if (!(Number(soldPrice) > 0)) {
      setError("请填写得物售价");
      return;
    }
    if (paid && !(Number(payout) >= 0 && payout !== "")) {
      setError("请填写实际到账金额");
      return;
    }
    setBusy(true);
    setError("");
    const to = paid ? "settled" : "sold";
    const result = await batchChangeStatus(getDb(), units, to, {
      note,
      sale: {
        sold_price: Number(soldPrice),
        platform_fee: Number(platformFee) || 0,
        platform_subsidy: Number(subsidy) || 0,
        express_fee: Number(expressFee) || 0,
        other_fee: Number(otherFee) || 0,
        actual_payout: paid ? Number(payout) : undefined,
        sold_at: soldAt,
        settled_at: paid ? settledAt : undefined,
      },
    });
    const msg =
      result.failed.length === 0
        ? many
          ? `已更新 ${result.ok} 件`
          : paid
            ? "已登记售出并结算"
            : "已登记售出"
        : `成功 ${result.ok} 件，失败 ${result.failed.length} 件`;
    await onDone(msg, to);
  }

  return (
    <Sheet open title={many ? `登记售出（${units.length} 件）` : "登记售出"} onClose={onClose}>
      <div className="max-h-[62vh] space-y-3 overflow-y-auto pb-1">
        <Field label={`得物售价（元${many ? "/件" : ""}）`}>
          <input {...moneyInputProps} className={inputCls} placeholder="0.00" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="平台费用" optional>
            <input {...moneyInputProps} className={inputCls} placeholder="0.00" value={platformFee} onChange={(e) => setPlatformFee(e.target.value)} />
          </Field>
          <Field label="平台补贴" optional>
            <input {...moneyInputProps} className={inputCls} placeholder="0.00" value={subsidy} onChange={(e) => setSubsidy(e.target.value)} />
          </Field>
          <Field label="发往得物快递费" optional>
            <input {...moneyInputProps} className={inputCls} placeholder="0.00" value={expressFee} onChange={(e) => setExpressFee(e.target.value)} />
          </Field>
          <Field label="其他销售费用" optional>
            <input {...moneyInputProps} className={inputCls} placeholder="0.00" value={otherFee} onChange={(e) => setOtherFee(e.target.value)} />
          </Field>
        </div>
        <Field label="售出日期">
          <input type="date" className={inputCls} value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
        </Field>

        {/* 已到账开关：开了直接到已结算 */}
        <button
          type="button"
          onClick={() => setPaid((p) => !p)}
          className="flex w-full items-center justify-between rounded-xl bg-background px-3 py-3"
        >
          <span className="text-[14px]">已到账（直接结算）</span>
          <span
            className={`relative h-7 w-12 rounded-full transition-colors ${paid ? "bg-[#34C759]" : "bg-separator"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${paid ? "left-[22px]" : "left-0.5"}`}
            />
          </span>
        </button>

        {paid && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="实际到账金额（元）">
              <input {...moneyInputProps} className={inputCls} placeholder="0.00" value={payout} onChange={(e) => setPayout(e.target.value)} />
            </Field>
            <Field label="结算日期">
              <input type="date" className={inputCls} value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
            </Field>
          </div>
        )}

        <Field label="备注" optional>
          <input className={inputCls} placeholder="选填" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && <p className="text-center text-[13px] text-[#FF3B30]">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full rounded-xl bg-tint py-3 text-[16px] font-medium text-white active:opacity-80 disabled:opacity-40"
        >
          {busy ? "提交中…" : paid ? "登记售出并结算" : "登记售出"}
        </button>
      </div>
    </Sheet>
  );
}
