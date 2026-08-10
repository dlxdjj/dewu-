"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import ImagePicker from "@/components/ui/ImagePicker";
import PageHeader from "@/components/ui/PageHeader";
import { findProductByStyleCode, loadProductImageUrls } from "@/lib/catalog";
import { PLATFORMS, type Platform } from "@/lib/constants/platform";
import {
  PURCHASE_INITIAL_STATUSES,
  STATUS_META,
  type UnitStatus,
} from "@/lib/constants/status";
import { getDb } from "@/lib/data";
import type { DbAdapter } from "@/lib/data/types";
import { createPurchase } from "@/lib/services/purchase";
import { todayStr } from "@/lib/utils/format";

const inputClass =
  "w-full min-w-0 max-w-full box-border rounded-xl bg-background px-3 py-3 text-base";

interface PurchaseFormState {
  productName: string;
  styleCode: string;
  platform: Platform;
  unitPrice: string;
  quantity: string;
  purchasedAt: string;
  size: string;
  initialStatus: UnitStatus;
  orderNo: string;
  note: string;
}

const initialForm = (): PurchaseFormState => ({
  productName: "",
  styleCode: "",
  platform: "taobao",
  unitPrice: "",
  quantity: "1",
  purchasedAt: todayStr(),
  size: "",
  initialStatus: "pending",
  orderNo: "",
  note: "",
});

export default function PurchaseForm({
  dataSource,
  onComplete,
}: {
  dataSource?: DbAdapter;
  onComplete: () => void;
}) {
  const [form, setForm] = useState<PurchaseFormState>(initialForm);
  const [image, setImage] = useState<Blob | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [checkingImage, setCheckingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedProductId, setSavedProductId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const resolveDb = useCallback(
    (): DbAdapter => dataSource ?? getDb(),
    [dataSource],
  );

  useEffect(() => {
    const raw = sessionStorage.getItem("pms_ocr_prefill");
    if (!raw) return;
    sessionStorage.removeItem("pms_ocr_prefill");
    try {
      const prefill = JSON.parse(raw) as Partial<PurchaseFormState>;
      queueMicrotask(() => setForm((old) => ({ ...old, ...prefill })));
    } catch {
      queueMicrotask(() => setError("OCR 回填内容已失效，请手工录入"));
    }
  }, []);

  useEffect(() => {
    const styleCode = form.styleCode.trim();
    if (!styleCode) {
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      setCheckingImage(true);
      try {
        const db = resolveDb();
        const product = findProductByStyleCode(
          await db.listProducts(),
          styleCode,
        );
        if (!active) return;
        if (!product) {
          setExistingImage(null);
          return;
        }
        const urls = await loadProductImageUrls(db, [product.id]);
        if (active) setExistingImage(urls.get(product.id) ?? null);
      } catch {
        if (active) setExistingImage(null);
      } finally {
        if (active) setCheckingImage(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [form.styleCode, resolveDb]);

  function set<K extends keyof PurchaseFormState>(
    key: K,
    value: PurchaseFormState[K],
  ): void {
    setForm((old) => ({ ...old, [key]: value }));
  }

  async function uploadImage(productId: string): Promise<void> {
    if (!image) return;
    await resolveDb().saveAttachment({
      file: image,
      owner_type: "product",
      owner_id: productId,
      kind: "product_image",
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await createPurchase(resolveDb(), {
        ...form,
        unitPriceYuan: form.unitPrice,
        quantity: Number(form.quantity),
      });
      if (!image) {
        onComplete();
        return;
      }
      try {
        await uploadImage(result.productId);
        onComplete();
      } catch {
        setSavedProductId(result.productId);
        setError("商品已保存，但图片上传失败");
        setSaving(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
      setSaving(false);
    }
  }

  async function retryImage(): Promise<void> {
    if (!savedProductId || !image) return;
    setSaving(true);
    setError("");
    try {
      await uploadImage(savedProductId);
      onComplete();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `图片仍未上传：${reason.message}`
          : "图片仍未上传",
      );
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title="添加" subtitle="录入采购并保存商品图片" />
      <Link
        href="/add/ocr"
        className="mb-3 block rounded-2xl bg-card py-3 text-center text-sm text-tint"
      >
        拍照识别订单截图（需人工确认）
      </Link>
      <form onSubmit={submit}>
        <Card className="min-w-0 space-y-4 overflow-hidden">
          <label className="block min-w-0 text-sm">
            品名（必填）
            <input
              aria-label="品名（必填）"
              required
              className={`${inputClass} mt-1`}
              value={form.productName}
              onChange={(event) => set("productName", event.target.value)}
            />
          </label>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <label className="min-w-0 text-sm">
              货号（必填）
              <input
                aria-label="货号（必填）"
                required
                className={`${inputClass} mt-1`}
                value={form.styleCode}
                onChange={(event) => {
                  set("styleCode", event.target.value);
                  setExistingImage(null);
                  setCheckingImage(false);
                }}
              />
            </label>
            <label className="min-w-0 text-sm">
              尺码（必填）
              <input
                aria-label="尺码（必填）"
                required
                className={`${inputClass} mt-1`}
                value={form.size}
                onChange={(event) => set("size", event.target.value)}
              />
            </label>
            <label className="min-w-0 text-sm">
              单件进价（元，必填）
              <input
                aria-label="单件进价（元，必填）"
                required
                inputMode="decimal"
                className={`${inputClass} mt-1`}
                value={form.unitPrice}
                onChange={(event) => set("unitPrice", event.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="min-w-0 text-sm">
              数量（必填）
              <input
                aria-label="数量（必填）"
                required
                inputMode="numeric"
                className={`${inputClass} mt-1`}
                value={form.quantity}
                onChange={(event) => set("quantity", event.target.value)}
              />
            </label>
          </div>
          <label className="block min-w-0 max-w-full text-sm">
            采购日期（必填）
            <input
              aria-label="采购日期（必填）"
              required
              type="date"
              className={`${inputClass} mt-1`}
              value={form.purchasedAt}
              onChange={(event) => set("purchasedAt", event.target.value)}
            />
          </label>
          <label className="block min-w-0 text-sm">
            采购平台
            <select
              aria-label="采购平台"
              className={`${inputClass} mt-1`}
              value={form.platform}
              onChange={(event) =>
                set("platform", event.target.value as Platform)
              }
            >
              {PLATFORMS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-sm">
            当前状态
            <select
              aria-label="当前状态"
              className={`${inputClass} mt-1`}
              value={form.initialStatus}
              onChange={(event) =>
                set("initialStatus", event.target.value as UnitStatus)
              }
            >
              {PURCHASE_INITIAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-sm">
            订单号（可选）
            <input
              aria-label="订单号（可选）"
              className={`${inputClass} mt-1`}
              value={form.orderNo}
              onChange={(event) => set("orderNo", event.target.value)}
            />
          </label>
          {checkingImage && (
            <p className="text-xs text-muted">正在检查该货号的历史图片…</p>
          )}
          {existingImage && (
            <div className="rounded-xl bg-background p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={existingImage}
                alt={`${form.styleCode.trim()} 已有商品图片`}
                className="h-24 w-full rounded-lg object-cover"
              />
              <p className="mt-2 text-xs text-muted">
                该货号已有图片，将默认复用
              </p>
            </div>
          )}
          <ImagePicker
            label={existingImage ? "选择新图片替换" : "添加商品图片"}
            value={image}
            onChange={setImage}
          />
        </Card>
        {error && (
          <p role="alert" aria-live="polite" className="mt-3 text-center text-sm text-danger">
            {error}
          </p>
        )}
        {savedProductId ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={retryImage}
              className="rounded-xl bg-tint py-3 font-medium text-white disabled:opacity-40"
            >
              {saving ? "上传中…" : "重试上传图片"}
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="rounded-xl bg-card py-3 font-medium text-tint"
            >
              先去库存
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={saving}
            className="mt-4 w-full rounded-xl bg-tint py-3 font-medium text-white disabled:opacity-40"
          >
            {saving
              ? "保存中…"
              : `保存并生成 ${Number(form.quantity) || 1} 件`}
          </button>
        )}
      </form>
    </div>
  );
}
