"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAppData } from "@/components/AppDataProvider";
import Card from "@/components/ui/Card";
import ImagePicker from "@/components/ui/ImagePicker";
import PageHeader from "@/components/ui/PageHeader";
import {
  findProductByStyleCode,
  loadProductImageUrls,
  normalizeStyleCode,
} from "@/lib/catalog";
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
import { normalizeMoneyInput } from "@/lib/utils/money";

const inputClass =
  "w-full min-w-0 max-w-full box-border rounded-full border border-separator bg-card px-4 py-3 text-base shadow-[var(--cirrus-shadow-1)]";

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
  showPlatform = true,
  allowMissingSize = false,
  showHeader = true,
}: {
  dataSource?: DbAdapter;
  onComplete: () => void;
  showPlatform?: boolean;
  allowMissingSize?: boolean;
  showHeader?: boolean;
}) {
  const [form, setForm] = useState<PurchaseFormState>(initialForm);
  const [image, setImage] = useState<Blob | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [checkingImage, setCheckingImage] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedProductId, setSavedProductId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const draftLoadedKeyRef = useRef("");
  const shared = useAppData();
  const draftOwner = dataSource
    ? "memory"
    : shared?.data?.preferences.user_id ?? "";
  const draftKey = draftOwner
    ? `pms_purchase_draft:${draftOwner}:${allowMissingSize ? "bulk" : "standard"}`
    : "";

  const resolveDb = useCallback(
    (): DbAdapter => dataSource ?? getDb(),
    [dataSource],
  );

  useEffect(() => {
    if (!draftKey) return;
    queueMicrotask(() => {
      const storage = purchaseDraftStorage();
      if (!storage) {
        draftLoadedKeyRef.current = draftKey;
        return;
      }
      try {
        const raw = storage.getItem(draftKey);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<PurchaseFormState>;
          setForm((current) => ({ ...current, ...saved }));
          setDraftMessage("已恢复上次文字草稿，图片需重新选择");
        }
      } catch {
        storage.removeItem(draftKey);
      } finally {
        draftLoadedKeyRef.current = draftKey;
      }
    });
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    const timeoutId = window.setTimeout(() => {
      if (draftLoadedKeyRef.current !== draftKey) return;
      try {
        purchaseDraftStorage()?.setItem(draftKey, JSON.stringify(form));
      } catch {
        // A failed draft write must never block purchase entry.
      }
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [draftKey, form]);

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
        const product = findProductByStyleCode(await db.listProducts(), styleCode);
        if (!active) return;
        if (!product) {
          if (allowMissingSize) {
            const catalog = (await db.listCatalogProducts()).find(
              (item) => item.normalized_style_code === normalizeStyleCode(styleCode),
            );
            if (!active) return;
            if (catalog) {
              setForm((old) => ({ ...old, productName: catalog.canonical_name }));
              let catalogImage: string | null = null;
              if (catalog.image_path) {
                catalogImage = await db.catalogImageUrl(catalog).catch(() => null);
              }
              if (!active) return;
              setExistingImage(catalogImage);
              setCatalogMessage(
                catalogImage
                  ? "已按货号匹配标准名称和商品图片"
                  : "已按货号匹配标准名称，商品图片暂缺",
              );
              return;
            }
          }
          setExistingImage(null);
          setCatalogMessage("");
          return;
        }
        const urls = await loadProductImageUrls(db, [product]);
        if (active) {
          const url = urls.get(product.id) ?? null;
          setExistingImage(url);
          if (allowMissingSize) {
            setForm((old) => ({ ...old, productName: product.name }));
            setCatalogMessage(
              url
                ? "已按货号匹配已有名称和商品图片"
                : "已按货号匹配已有名称，商品图片暂缺",
            );
          }
        }
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
  }, [allowMissingSize, form.styleCode, resolveDb]);

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
        platform: showPlatform ? form.platform : "other",
        allowMissingSize,
        unitPriceYuan: form.unitPrice,
        quantity: Number(form.quantity),
      });
      if (draftKey) purchaseDraftStorage()?.removeItem(draftKey);
      setDraftMessage("");
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
      if (draftKey) purchaseDraftStorage()?.removeItem(draftKey);
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
    <div className="mx-auto w-full max-w-xl pb-28">
      {showHeader && (
        <PageHeader
          title="添加"
          subtitle={
            allowMissingSize ? "录入商品，尺码可以稍后补充" : "录入采购并保存商品图片"
          }
        />
      )}
      <Link
        href="/add/ocr"
        className="inventory-action-button mb-4 block rounded-full py-3.5 text-center text-sm font-semibold"
      >
        拍照识别订单截图（需人工确认）
      </Link>
      {draftMessage && (
        <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-[20px] bg-card px-4 py-3 text-sm shadow-[var(--cirrus-shadow-1)]">
          <span className="text-muted">{draftMessage}</span>
          <button
            type="button"
            className="min-h-11 shrink-0 text-tint"
            onClick={() => {
              if (draftKey) purchaseDraftStorage()?.removeItem(draftKey);
              setForm(initialForm());
              setImage(null);
              setDraftMessage("");
            }}
          >
            清空草稿
          </button>
        </div>
      )}
      <form id="purchase-entry-form" onSubmit={submit}>
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
                  setCatalogMessage("");
                }}
              />
            </label>
            <label className="min-w-0 text-sm">
              {allowMissingSize ? "尺码（可后补）" : "尺码（必填）"}
              <input
                aria-label={allowMissingSize ? "尺码（可后补）" : "尺码（必填）"}
                required={!allowMissingSize}
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
                onChange={(event) =>
                  set("unitPrice", normalizeMoneyInput(event.target.value))
                }
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
            <span className="date-input-shell mt-1">
              <input
                aria-label="采购日期（必填）"
                required
                type="date"
                className="mobile-date-input"
                value={form.purchasedAt}
                onChange={(event) => set("purchasedAt", event.target.value)}
              />
            </span>
          </label>
          {showPlatform && (
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
          )}
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
          {catalogMessage && (
            <p role="status" className="text-xs text-tint">{catalogMessage}</p>
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
        <div aria-hidden="true" className="h-24" />
        <div className="fixed inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-[24px] border border-separator bg-card/95 p-2.5 shadow-[var(--cirrus-shadow-2)] backdrop-blur-md">
        {savedProductId ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={retryImage}
              className="rounded-full bg-tint py-3 font-medium text-white shadow-[var(--cirrus-shadow-2)] disabled:opacity-40"
            >
              {saving ? "上传中…" : "重试上传图片"}
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="rounded-full border border-separator bg-card py-3 font-medium text-tint shadow-[var(--cirrus-shadow-1)]"
            >
              先去库存
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-tint py-3.5 font-medium text-white shadow-[var(--cirrus-shadow-2)] disabled:opacity-40"
          >
            {saving
              ? "保存中…"
              : `保存并生成 ${Number(form.quantity) || 1} 件`}
          </button>
        )}
        </div>
      </form>
    </div>
  );
}

function purchaseDraftStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage ?? null;
  } catch {
    return null;
  }
}
