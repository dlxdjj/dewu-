"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Field, { inputCls, moneyInputProps } from "@/components/ui/Field";
import { CameraIcon } from "@/components/ui/icons";
import { compressImage } from "@/lib/image-processing";
import {
  OCR_PREFILL_KEY,
  disposeOcrWorker,
  parseOrderText,
  recognizeText,
  type OcrPrefill,
} from "@/lib/ocr";
import { PLATFORMS, type Platform } from "@/lib/constants/platform";
import { useAppData } from "@/components/AppDataProvider";

type Step = "pick" | "recognizing" | "confirm" | "failed";

export default function OcrPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<OcrPrefill>({});
  const [rawText, setRawText] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const shared = useAppData();
  const bulk = shared?.data?.preferences.workflow === "bulk";

  useEffect(() => () => { void disposeOcrWorker(); }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStep("recognizing");
    setProgress(0);
    setError("");
    try {
      const compressed = await compressImage(file, 1600, 0.85);
      const result = await recognizeText(compressed, setProgress);
      setRawText(result.text);
      setDurationMs(result.durationMs);
      setFields(parseOrderText(result.text));
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "识别失败，请重试");
      setStep("failed");
    }
  }

  function confirm() {
    sessionStorage.setItem(
      OCR_PREFILL_KEY,
      JSON.stringify(bulk ? { ...fields, platform: "other" } : fields),
    );
    router.push("/add");
  }

  function set<K extends keyof OcrPrefill>(key: K, value: OcrPrefill[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  return (
    <>
      <Link href="/add" className="text-[15px] text-tint">‹ 添加</Link>
      <div className="mt-1">
        <PageHeader title="识别订单截图" subtitle="识别 → 校对 → 回填添加页" />
      </div>

      {step === "pick" && (
        <Card>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-separator bg-background text-muted active:bg-separator/40"
          >
            <CameraIcon size={32} strokeWidth={1.4} />
            <span className="text-[14px]">拍摄或选择订单截图</span>
            <span className="px-8 text-center text-[11px]">
              建议截图包含商品名、实付金额、订单号区域
            </span>
          </button>
        </Card>
      )}

      {step === "recognizing" && (
        <Card>
          <p className="py-2 text-center text-[14px]">正在识别…</p>
          <div className="mx-auto my-4 h-1.5 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-tint transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="pb-2 text-center text-[12px] text-muted">
            {Math.round(progress * 100)}%（首次使用需下载语言包，请稍候）
          </p>
        </Card>
      )}

      {step === "failed" && (
        <Card className="space-y-3">
          <p role="alert" className="py-2 text-center text-[14px] text-danger">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setStep("pick")}
            className="w-full rounded-xl bg-tint py-3 text-[15px] font-medium text-white"
          >
            重新选择截图
          </button>
        </Card>
      )}

      {step === "confirm" && (
        <>
          <Card className="space-y-4">
            <p className="rounded-lg bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#8a6d00]">
              OCR 仅提供候选值，空白或不准确字段必须人工核对后再回填。耗时 {(durationMs / 1000).toFixed(1)} 秒
            </p>
            <Field label="品名" optional>
              <input className={inputCls} value={fields.productName ?? ""} onChange={(e) => set("productName", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="货号" optional>
                <input className={inputCls} value={fields.styleCode ?? ""} onChange={(e) => set("styleCode", e.target.value)} />
              </Field>
              <Field label="尺码" optional>
                <input className={inputCls} value={fields.size ?? ""} onChange={(e) => set("size", e.target.value)} />
              </Field>
              <Field label="采购单价（元）" optional>
                <input {...moneyInputProps} className={inputCls} value={fields.unitPrice ?? ""} onChange={(e) => set("unitPrice", e.target.value)} />
              </Field>
              <Field label="数量" optional>
                <input type="text" inputMode="numeric" className={inputCls} value={fields.quantity ?? ""} onChange={(e) => set("quantity", e.target.value)} />
              </Field>
            </div>
            {!bulk && (
              <Field label="采购平台" optional>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => set("platform", p.value as Platform)}
                      className={`rounded-full px-4 py-2 text-[14px] ${
                        fields.platform === p.value ? "bg-label font-medium text-card" : "bg-background text-label"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="订单号" optional>
              <input className={inputCls} value={fields.orderNo ?? ""} onChange={(e) => set("orderNo", e.target.value)} />
            </Field>
          </Card>

          <details className="mt-3 rounded-2xl bg-card p-4 text-[12px] text-muted shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <summary className="text-[13px]">查看原始识别文本</summary>
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap">{rawText}</pre>
          </details>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={confirm}
              className="w-full rounded-xl bg-tint py-3 text-[16px] font-medium text-white active:opacity-80"
            >
              确认，填入添加页
            </button>
            <button
              type="button"
              onClick={() => setStep("pick")}
              className="w-full rounded-xl bg-card py-3 text-[15px] text-tint shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            >
              重新识别
            </button>
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="h-6" />
    </>
  );
}
