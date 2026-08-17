"use client";

import { useMemo, useState, type FormEvent } from "react";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import {
  registerUnitSales,
  settleUnitPayouts,
  type UnitPayoutEntry,
} from "@/lib/services/status";
import type { UnitJoined } from "@/lib/types/database";
import { todayStr } from "@/lib/utils/format";
import {
  formatCents,
  normalizeMoneyInput,
  parseYuanToCents,
} from "@/lib/utils/money";
import Sheet from "./Sheet";

type PayoutMode = "same" | "individual";

export default function SaleFormSheet({
  units,
  dataSource,
  allowPending = false,
  onClose,
  onDone,
}: {
  units: UnitJoined[];
  dataSource?: DbAdapter;
  /** 得物仓未售商品登记售出时允许金额留空，稍后再结算。 */
  allowPending?: boolean;
  onClose: () => void;
  onDone: (message: string, to: "sold" | "settled") => Promise<void> | void;
}) {
  const editing = !allowPending && units.every((unit) => unit.status === "settled");
  const [mode, setMode] = useState<PayoutMode>("same");
  const [payout, setPayout] = useState(() => commonPayout(units));
  const [individualPayouts, setIndividualPayouts] = useState(() =>
    Object.fromEntries(
      units.map((unit) => [
        unit.id,
        unit.sale?.actual_payout_cents == null
          ? ""
          : centsForInput(unit.sale.actual_payout_cents),
      ]),
    ),
  );
  const [date, setDate] = useState(() => commonSettlementDate(units));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => {
    if (!units.length) return null;
    const values = mode === "same"
      ? units.map(() => payout)
      : units.map((unit) => individualPayouts[unit.id] ?? "");
    if (!allowPending && values.some((value) => !value.trim())) return null;
    try {
      const entries = units.map((unit, index): UnitPayoutEntry => ({
        unitId: unit.id,
        payoutYuan: values[index],
      }));
      const cents = entries.map((entry) =>
        entry.payoutYuan.trim() ? parseYuanToCents(entry.payoutYuan) : null,
      );
      const totalCents = cents.reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      );
      if (!Number.isSafeInteger(totalCents)) return null;
      return {
        entries,
        totalCents,
        settledCount: cents.filter((value) => value != null).length,
        pendingCount: cents.filter((value) => value == null).length,
      };
    } catch {
      return null;
    }
  }, [allowPending, individualPayouts, mode, payout, units]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!preview) {
      setError(
        allowPending
          ? "请填写正确的实际到手价，或全部留空稍后结算"
          : "请填写正确的实际到手价",
      );
      return;
    }
    if (preview.settledCount > 0 && !date) {
      setError("请选择结算日期");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (allowPending) {
        const result = await registerUnitSales(
          dataSource ?? getDb(),
          units,
          preview.entries,
          date,
        );
        const message = result.pending && result.settled
          ? `已登记 ${units.length} 件，${result.settled} 件已结算、${result.pending} 件待结算`
          : result.settled
            ? `已售出并结算 ${result.settled} 件`
            : `已标记售出 ${result.pending} 件，稍后可补录到手价`;
        await onDone(message, result.pending ? "sold" : "settled");
      } else {
        await settleUnitPayouts(dataSource ?? getDb(), preview.entries, date);
        await onDone(
          editing ? "到手价已更新" : `已结算 ${units.length} 件`,
          "settled",
        );
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  const title = allowPending
    ? units.length > 1
      ? `批量登记售出（${units.length} 件）`
      : "登记售出"
    : editing
      ? units.length > 1
        ? `批量修改到手价（${units.length} 件）`
        : "修改实际到手价"
      : units.length > 1
        ? `批量登记到手价（${units.length} 件）`
        : "登记实际到手价";

  return (
    <Sheet open title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {allowPending && (
          <p className="rounded-xl bg-background px-3 py-2.5 text-sm leading-6 text-muted">
            已知实际到手价可直接填写并结算；暂时不知道可以留空，商品会进入“待结算”。
          </p>
        )}

        {units.length > 1 && (
          <fieldset>
            <legend className="text-sm">到手价填写方式</legend>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-background p-1">
              <button
                type="button"
                aria-pressed={mode === "same"}
                onClick={() => setMode("same")}
                className={`min-h-11 rounded-lg text-sm ${mode === "same" ? "bg-card font-medium shadow-sm" : "text-muted"}`}
              >
                全部相同
              </button>
              <button
                type="button"
                aria-pressed={mode === "individual"}
                onClick={() => setMode("individual")}
                className={`min-h-11 rounded-lg text-sm ${mode === "individual" ? "bg-card font-medium shadow-sm" : "text-muted"}`}
              >
                分别填写
              </button>
            </div>
          </fieldset>
        )}

        {mode === "same" ? (
          <label className="block text-sm">
            {units.length > 1 ? "每件实际到手价" : "实际到手价"}
            {allowPending ? "（元，可留空）" : "（元，必填）"}
            <input
              aria-label="实际到手价"
              required={!allowPending}
              inputMode="decimal"
              value={payout}
              onChange={(event) => setPayout(normalizeMoneyInput(event.target.value))}
              className="mt-1 w-full min-w-0 rounded-xl bg-background px-3 py-3 text-base"
              placeholder={allowPending ? "留空则稍后结算" : "0.00"}
            />
          </label>
        ) : (
          <div className="max-h-[34dvh] space-y-2 overflow-y-auto pr-1">
            {units.map((unit, index) => (
              <label key={unit.id} className="block rounded-xl bg-background p-3 text-sm">
                <span className="block truncate font-medium">
                  第 {index + 1} 件 · {unit.size || "待补尺码"}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {unit.product.style_code || unit.product.name}
                </span>
                <input
                  aria-label={`第 ${index + 1} 件实际到手价`}
                  required={!allowPending}
                  inputMode="decimal"
                  value={individualPayouts[unit.id] ?? ""}
                  onChange={(event) => setIndividualPayouts((old) => ({
                    ...old,
                    [unit.id]: normalizeMoneyInput(event.target.value),
                  }))}
                  className="mt-2 w-full min-w-0 rounded-xl bg-card px-3 py-3 text-base"
                  placeholder={allowPending ? "留空则稍后结算" : "0.00"}
                />
              </label>
            ))}
          </div>
        )}

        {preview && (
          <div className="rounded-xl bg-background px-3 py-2.5 text-sm leading-6">
            {preview.settledCount > 0 && (
              <p className="font-medium">
                {preview.settledCount} 件到账合计 {formatCents(preview.totalCents)}
              </p>
            )}
            {preview.pendingCount > 0 && (
              <p className="text-muted">{preview.pendingCount} 件将进入待结算</p>
            )}
          </div>
        )}

        {preview && preview.settledCount > 0 && (
          <label className="block min-w-0 text-sm">
            结算日期（必填）
            <span className="date-input-shell mt-1">
              <input
                aria-label="结算日期"
                required
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mobile-date-input"
              />
            </span>
          </label>
        )}

        {error && <p role="alert" className="text-center text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || !preview || (preview.settledCount > 0 && !date)}
          className="w-full rounded-xl bg-tint py-3 text-[15px] font-medium text-white disabled:opacity-40"
        >
          {busy
            ? "提交中…"
            : allowPending
              ? preview?.settledCount
                ? preview.pendingCount
                  ? "确认登记售出"
                  : "确认售出并结算"
                : "标记已售，稍后结算"
              : editing
                ? "确认修改到手价"
                : "确认到手价并结算"}
        </button>
      </form>
    </Sheet>
  );
}

function commonPayout(units: UnitJoined[]): string {
  const values = units.map((unit) => unit.sale?.actual_payout_cents ?? null);
  const first = values[0];
  return first != null && values.every((value) => value === first)
    ? centsForInput(first)
    : "";
}

function commonSettlementDate(units: UnitJoined[]): string {
  const values = units.map((unit) => unit.sale?.settled_at ?? null);
  const first = values[0];
  return first && values.every((value) => value === first) ? first : todayStr();
}

function centsForInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
