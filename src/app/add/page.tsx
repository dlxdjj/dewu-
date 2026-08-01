"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Field, { inputCls, moneyInputProps } from "@/components/ui/Field";
import ImagePicker from "@/components/ui/ImagePicker";
import { getDb } from "@/lib/data";
import { createPurchase } from "@/lib/services/purchase";
import { PLATFORMS, type Platform } from "@/lib/constants/platform";
import { STATUS_META, UNIT_STATUSES, type UnitStatus } from "@/lib/constants/status";
import { todayStr } from "@/lib/utils/format";
import type { Product } from "@/lib/types/database";

interface FormState {
  productName: string;
  styleCode: string;
  platform: Platform;
  unitPrice: string;
  quantity: string;
  shippingFee: string;
  discountAmount: string;
  purchasedAt: string;
  size: string;
  initialStatus: UnitStatus;
  orderNo: string;
  note: string;
}

const initialForm: FormState = {
  productName: "",
  styleCode: "",
  platform: "taobao",
  unitPrice: "",
  quantity: "1",
  shippingFee: "",
  discountAmount: "",
  purchasedAt: todayStr(),
  size: "",
  initialStatus: "pending",
  orderNo: "",
  note: "",
};

export default function AddPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [productImage, setProductImage] = useState<Blob | null>(null);
  const [orderShot, setOrderShot] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDb()
      .listProducts()
      .then(setProducts)
      .catch(() => {});
    // OCR 识别回填
    const raw = sessionStorage.getItem("pms_ocr_prefill");
    if (raw) {
      sessionStorage.removeItem("pms_ocr_prefill");
      try {
        const prefill = JSON.parse(raw) as Partial<FormState>;
        queueMicrotask(() => setForm((f) => ({ ...f, ...prefill })));
      } catch {
        /* 忽略格式错误 */
      }
    }
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onStyleCodeChange(v: string) {
    setForm((f) => {
      const hit = products.find(
        (p) => (p.style_code ?? "").toLowerCase() === v.trim().toLowerCase() && v.trim() !== "",
      );
      return { ...f, styleCode: v, productName: hit ? hit.name : f.productName };
    });
  }

  function validate(): string | null {
    if (!form.productName.trim()) return "请填写品名";
    if (!(Number(form.unitPrice) > 0)) return "请填写正确的采购单价";
    if (!(Number.isInteger(Number(form.quantity)) && Number(form.quantity) >= 1))
      return "数量需为 ≥1 的整数";
    if (!form.size.trim()) return "请填写尺码";
    if (!form.purchasedAt) return "请选择采购日期";
    return null;
  }

  async function onSave() {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await createPurchase(getDb(), {
        productName: form.productName,
        styleCode: form.styleCode,
        productImage,
        platform: form.platform,
        unitPrice: Number(form.unitPrice),
        quantity: Number(form.quantity),
        shippingFee: Number(form.shippingFee) || 0,
        discountAmount: Number(form.discountAmount) || 0,
        purchasedAt: form.purchasedAt,
        size: form.size,
        initialStatus: form.initialStatus,
        orderNo: form.orderNo,
        orderScreenshot: orderShot,
        note: form.note,
      });
      router.push("/inventory");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="添加" subtitle="录入采购商品" />

      {/* OCR 入口 */}
      <Link
        href="/add/ocr"
        className="mb-3 flex items-center justify-center gap-1 rounded-2xl bg-card py-3 text-[14px] text-tint shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-background"
      >
        拍照识别订单截图，自动填写
      </Link>

      {/* 分组 1：商品信息 */}
      <p className="mb-1.5 mt-4 px-1 text-[13px] text-muted">商品信息</p>
      <Card className="space-y-4">
        <ImagePicker label="商品图片（拍照/相册）" value={productImage} onChange={setProductImage} />
        <Field label="品名">
          <input
            className={inputCls}
            placeholder="如 Nike Air Force 1 '07 白"
            value={form.productName}
            onChange={(e) => set("productName", e.target.value)}
          />
        </Field>
        <Field label="货号" optional>
          <input
            className={inputCls}
            placeholder="如 CW2288-111"
            list="style-codes"
            value={form.styleCode}
            onChange={(e) => onStyleCodeChange(e.target.value)}
          />
          <datalist id="style-codes">
            {products
              .filter((p) => p.style_code)
              .map((p) => (
                <option key={p.id} value={p.style_code!}>
                  {p.name}
                </option>
              ))}
          </datalist>
        </Field>
        <Field label="尺码">
          <input
            className={inputCls}
            placeholder="如 42.5 / L"
            value={form.size}
            onChange={(e) => set("size", e.target.value)}
          />
        </Field>
      </Card>

      {/* 分组 2：采购信息 */}
      <p className="mb-1.5 mt-5 px-1 text-[13px] text-muted">采购信息</p>
      <Card className="space-y-4">
        <Field label="采购平台">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => set("platform", p.value)}
                className={`rounded-full px-4 py-2 text-[14px] ${
                  form.platform === p.value
                    ? "bg-label font-medium text-card"
                    : "bg-background text-label"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="采购单价（元）">
            <input
              {...moneyInputProps}
              className={inputCls}
              placeholder="0.00"
              value={form.unitPrice}
              onChange={(e) => set("unitPrice", e.target.value)}
            />
          </Field>
          <Field label="数量">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={inputCls}
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
          </Field>
          <Field label="采购运费（元）" optional>
            <input
              {...moneyInputProps}
              className={inputCls}
              placeholder="0.00"
              value={form.shippingFee}
              onChange={(e) => set("shippingFee", e.target.value)}
            />
          </Field>
          <Field label="优惠金额（元）" optional>
            <input
              {...moneyInputProps}
              className={inputCls}
              placeholder="0.00"
              value={form.discountAmount}
              onChange={(e) => set("discountAmount", e.target.value)}
            />
          </Field>
        </div>
        <Field label="采购日期">
          <input
            type="date"
            className={inputCls}
            value={form.purchasedAt}
            onChange={(e) => set("purchasedAt", e.target.value)}
          />
        </Field>
      </Card>

      {/* 分组 3：订单与物流 */}
      <p className="mb-1.5 mt-5 px-1 text-[13px] text-muted">订单与物流</p>
      <Card className="space-y-4">
        <Field label="当前物流状态">
          <select
            className={`${inputCls} appearance-none`}
            value={form.initialStatus}
            onChange={(e) => set("initialStatus", e.target.value as UnitStatus)}
          >
            {UNIT_STATUSES.filter((s) => s !== "refunded").map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="订单号" optional>
          <input
            className={inputCls}
            placeholder="采购平台订单号"
            value={form.orderNo}
            onChange={(e) => set("orderNo", e.target.value)}
          />
        </Field>
        <Field label="采购订单截图" optional>
          <ImagePicker label="上传订单截图" value={orderShot} onChange={setOrderShot} />
        </Field>
        <Field label="备注" optional>
          <textarea
            className={`${inputCls} min-h-[72px] resize-none`}
            placeholder="如 含鞋盒瑕疵、凑单等"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
      </Card>

      {error && (
        <p className="mt-3 text-center text-[13px] text-[#FF3B30]">{error}</p>
      )}

      {/* 保存按钮占位空间（固定栏 + 底部导航高度） */}
      <div className="h-24" />

      {/* 底部固定保存栏（位于底部导航之上） */}
      <div className="fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-40 border-t border-separator bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-2.5">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-full rounded-xl bg-tint py-3 text-[16px] font-medium text-white active:opacity-80 disabled:opacity-40"
          >
            {saving ? "保存中…" : `保存（生成 ${Number(form.quantity) || 1} 件库存）`}
          </button>
        </div>
      </div>
    </>
  );
}
