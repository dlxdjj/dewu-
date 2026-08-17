"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import { normalizeStyleCode } from "@/lib/catalog";
import type { DbAdapter } from "@/lib/data/types";
import { readSpreadsheet, type ReadSpreadsheetResult } from "@/lib/import/spreadsheet";
import { getDb } from "@/lib/data";
import type { CatalogProduct } from "@/lib/types/database";
import { todayStr } from "@/lib/utils/format";
import { formatCents } from "@/lib/utils/money";

export default function SpreadsheetImport({
  dataSource,
  onImported,
}: {
  dataSource?: DbAdapter;
  onImported: () => Promise<void> | void;
}) {
  const [preview, setPreview] = useState<ReadSpreadsheetResult | null>(null);
  const [catalogByStyle, setCatalogByStyle] = useState<Map<string, CatalogProduct>>(new Map());
  const [purchasedAt, setPurchasedAt] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const db = dataSource ?? getDb();

  const matchedRows = useMemo(
    () => preview?.rows.filter((row) => catalogByStyle.has(normalizeStyleCode(row.styleCode))).length ?? 0,
    [catalogByStyle, preview],
  );
  const imageMatchedRows = useMemo(
    () => preview?.rows.filter((row) =>
      Boolean(catalogByStyle.get(normalizeStyleCode(row.styleCode))?.image_path)
    ).length ?? 0,
    [catalogByStyle, preview],
  );

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const [parsed, catalog] = await Promise.all([
        readSpreadsheet(file),
        db.listCatalogProducts(),
      ]);
      setPreview(parsed);
      setCatalogByStyle(new Map(
        catalog.map((item) => [item.normalized_style_code, item]),
      ));
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : "表格读取失败");
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (!preview || preview.errors.length || !preview.rows.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await db.importPurchases({
        rows: preview.rows,
        fileHash: preview.fileHash,
        purchasedAt,
      });
      setMessage(
        `导入完成：${result.rowCount} 款、${result.unitCount} 件，货号匹配 ${result.matchedRows} 款`,
      );
      setPreview(null);
      await onImported();
    } catch (reason) {
      const raw = reason instanceof Error ? reason.message : "导入失败";
      setError(
        raw.includes("SPREADSHEET_ALREADY_IMPORTED")
          ? "这份表格已经导入过，为避免库存重复，本次没有写入"
          : raw,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="spreadsheet-import mb-4 min-w-0 overflow-hidden">
      <h2 className="font-medium">Excel 批量导入</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        A–D 为货号、货品名称、数量、进价；E 列尺码可选。导入后默认状态为已到货。
      </p>
      <label className="mt-3 block text-sm">
        采购日期
        <span className="date-input-shell mt-1">
          <input
            aria-label="表格采购日期"
            type="date"
            className="mobile-date-input"
            value={purchasedAt}
            onChange={(event) => setPurchasedAt(event.target.value)}
          />
        </span>
      </label>
      <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-separator bg-background px-3 text-sm font-medium">
        {busy ? "正在处理…" : "选择 .xlsx 表格"}
        <input
          aria-label="选择 Excel 表格"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          className="sr-only"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
      </label>

      {preview && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-background p-3">商品 <b>{preview.rows.length}</b> 款</div>
            <div className="rounded-xl bg-background p-3">数量 <b>{preview.totalUnits}</b> 件</div>
            <div className="rounded-xl bg-background p-3">总进价 <b>{formatCents(preview.totalCostCents)}</b></div>
            <div className="rounded-xl bg-background p-3">名称匹配 <b>{matchedRows}</b> 款</div>
            <div className="rounded-xl bg-background p-3">图片匹配 <b>{imageMatchedRows}</b> 款</div>
          </div>
          {preview.errors.length > 0 ? (
            <div role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">发现 {preview.errors.length} 个问题，尚未写入库存</p>
              <ul className="mt-2 space-y-1">
                {preview.errors.slice(0, 10).map((item, index) => (
                  <li key={`${item.rowNumber}-${index}`}>第 {item.rowNumber} 行：{item.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl bg-background p-2">
              {preview.rows.slice(0, 30).map((row) => {
                const matched = catalogByStyle.get(normalizeStyleCode(row.styleCode));
                const matchedName = matched?.canonical_name;
                return (
                  <div key={row.rowNumber} className="rounded-lg bg-card px-3 py-2 text-xs">
                    <p className="font-medium">{matchedName ?? row.productName}</p>
                    <p className="mt-1 text-muted">
                      {row.styleCode} · {row.size || "待补尺码"} · {row.quantity} 件 · {formatCents(row.unitPriceCents)}
                    </p>
                    {matchedName && matchedName !== row.productName && (
                      <p className="mt-1 text-tint">表格名称“{row.productName}”将替换为标准名称</p>
                    )}
                    {matched && (
                      <p className="mt-1 text-tint">
                        {matched.image_path ? "已匹配标准名称和商品图片" : "已匹配标准名称，商品图片暂缺"}
                      </p>
                    )}
                  </div>
                );
              })}
              {preview.rows.length > 30 && (
                <p className="py-2 text-center text-xs text-muted">其余 {preview.rows.length - 30} 款将在确认后一起导入</p>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={busy || preview.errors.length > 0 || !preview.rows.length}
            onClick={() => void submit()}
            className="min-h-12 w-full rounded-xl bg-tint px-4 font-medium disabled:opacity-40"
          >
            {busy ? "正在导入…" : `确认导入 ${preview.totalUnits} 件`}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-tint">{message}</p>}
    </Card>
  );
}
