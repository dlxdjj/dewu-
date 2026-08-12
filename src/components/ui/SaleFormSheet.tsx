"use client";

import { useMemo, useState, type FormEvent } from "react";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import { settleUnits } from "@/lib/services/status";
import type { UnitJoined } from "@/lib/types/database";
import { todayStr } from "@/lib/utils/format";
import {
  formatCents,
  parseYuanToCents,
} from "@/lib/utils/money";
import Sheet from "./Sheet";

export default function SaleFormSheet({
  units,
  dataSource,
  onClose,
  onDone,
}: {
  units: UnitJoined[];
  dataSource?: DbAdapter;
  onClose: () => void;
  onDone: (message: string, to: "settled") => Promise<void> | void;
}) {
  const editing = units.length === 1 && units[0]?.status === "settled";
  const [payout, setPayout] = useState(() => commonPayout(units));
  const [date, setDate] = useState(() => commonSettlementDate(units));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(() => {
    try {
      if (!payout.trim() || units.length === 0) return null;
      const eachCents = parseYuanToCents(payout);
      const totalCents = eachCents * units.length;
      if (!Number.isSafeInteger(totalCents)) return null;
      return { eachCents, totalCents };
    } catch {
      return null;
    }
  }, [payout, units.length]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!preview) {
      setError("请填写正确的实际到手价");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await settleUnits(
        dataSource ?? getDb(),
        units.map((unit) => unit.id),
        payout,
        date,
      );
      await onDone(
        editing ? "到手价已更新" : `已结算 ${units.length} 件`,
        "settled",
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "结算失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      title={
        editing
          ? "修改实际到手价"
          : units.length > 1
            ? `批量登记到手价（${units.length} 件）`
            : "登记实际到手价"
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          {units.length > 1
            ? "每件实际到手价（元，必填）"
            : "实际到手价（元，必填）"}
          <input
            aria-label="实际到手价"
            required
            inputMode="decimal"
            value={payout}
            onChange={(event) => setPayout(event.target.value)}
            className="mt-1 w-full min-w-0 rounded-xl bg-background px-3 py-3 text-base"
            placeholder="0.00"
          />
        </label>
        {preview && (
          <div className="rounded-xl bg-background px-3 py-2.5 text-sm leading-6">
            <p>
              {units.length} 件 × {formatCents(preview.eachCents)}
            </p>
            <p className="font-medium">
              实际到账合计 {formatCents(preview.totalCents)}
            </p>
            {units.length > 1 && (
              <p className="text-muted">每件会分别记录相同的到手价。</p>
            )}
          </div>
        )}
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
        {error && (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !preview || !date || units.length === 0}
          className="w-full rounded-xl bg-tint py-3 text-[15px] font-medium text-white disabled:opacity-40"
        >
          {busy
            ? "提交中…"
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
