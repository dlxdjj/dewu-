"use client";

import { useMemo, useState } from "react";
import Sheet from "./Sheet";
import type { InventoryUnit } from "@/lib/types/database";
import type { UnitSizeAssignment } from "@/lib/data/types";

interface DistributionRow {
  id: string;
  size: string;
  quantity: number;
}

export default function SizeAssignmentSheet({
  units,
  onClose,
  onConfirm,
}: {
  units: InventoryUnit[];
  onClose: () => void;
  onConfirm: (assignments: UnitSizeAssignment[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<DistributionRow[]>([
    { id: crypto.randomUUID(), size: "", quantity: units.length },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  const valid = useMemo(() => {
    const sizes = rows.map((row) => row.size.trim().toLocaleLowerCase());
    return rows.length > 0 && total === units.length &&
      rows.every((row) => row.size.trim() && Number.isSafeInteger(row.quantity) && row.quantity > 0) &&
      new Set(sizes).size === sizes.length;
  }, [rows, total, units.length]);

  return (
    <Sheet open title={`补充尺码（${units.length} 件）`} onClose={onClose}>
      <p className="mb-3 text-sm leading-6 text-muted">
        可将全部设为同一尺码，也可以按数量拆分多个尺码；总数必须保持 {units.length} 件。
      </p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2">
            <input
              aria-label={`第 ${index + 1} 组尺码`}
              value={row.size}
              onChange={(event) => setRows((old) => old.map((item) =>
                item.id === row.id ? { ...item, size: event.target.value } : item,
              ))}
              className="min-w-0 rounded-xl bg-background px-3"
              placeholder="尺码"
            />
            <input
              aria-label={`第 ${index + 1} 组数量`}
              inputMode="numeric"
              value={row.quantity || ""}
              onChange={(event) => setRows((old) => old.map((item) =>
                item.id === row.id
                  ? { ...item, quantity: /^\d+$/.test(event.target.value) ? Number(event.target.value) : 0 }
                  : item,
              ))}
              className="min-w-0 rounded-xl bg-background px-3"
              placeholder="数量"
            />
            <button
              type="button"
              aria-label={`删除第 ${index + 1} 组`}
              disabled={rows.length === 1}
              onClick={() => setRows((old) => old.filter((item) => item.id !== row.id))}
              className="min-h-11 px-2 text-danger disabled:opacity-30"
            >
              删除
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows((old) => [
          ...old,
          { id: crypto.randomUUID(), size: "", quantity: Math.max(0, units.length - total) },
        ])}
        className="mt-3 min-h-11 text-sm text-tint"
      >
        ＋ 添加另一个尺码
      </button>
      <p className={`mt-2 text-sm ${total === units.length ? "text-muted" : "text-danger"}`}>
        已分配 {total} / {units.length} 件
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button
        type="button"
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const ordered = [...units].sort((left, right) =>
              `${left.created_at}|${left.id}`.localeCompare(`${right.created_at}|${right.id}`),
            );
            let cursor = 0;
            const assignments: UnitSizeAssignment[] = [];
            for (const row of rows) {
              for (let index = 0; index < row.quantity; index += 1) {
                assignments.push({ unitId: ordered[cursor].id, size: row.size.trim() });
                cursor += 1;
              }
            }
            await onConfirm(assignments);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "尺码保存失败");
          } finally {
            setBusy(false);
          }
        }}
        className="mt-3 min-h-12 w-full rounded-xl bg-tint font-medium disabled:opacity-40"
      >
        {busy ? "保存中…" : "确认保存尺码"}
      </button>
    </Sheet>
  );
}
