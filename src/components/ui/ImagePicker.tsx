"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  compressImage,
  prepareProductImage,
} from "@/lib/image-processing";
import { CameraIcon } from "./icons";

/** 商品图片选择：自动裁截图黑边，再压缩到最长边 1200px 的 JPEG。 */
export default function ImagePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<File | null>(null);
  const autoCroppedBlobRef = useRef<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [hasAutoCrop, setHasAutoCrop] = useState(false);
  const [usingOriginal, setUsingOriginal] = useState(false);
  const [error, setError] = useState("");

  // 由 value 派生预览 URL，并在变化时释放旧 URL
  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setProcessing(true);
    setError("");
    try {
      const result = await prepareProductImage(file);
      sourceFileRef.current = file;
      autoCroppedBlobRef.current = result.cropApplied ? result.blob : null;
      setHasAutoCrop(result.cropApplied);
      setUsingOriginal(false);
      onChange(result.blob);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片处理失败");
    } finally {
      setProcessing(false);
    }
  }

  async function selectOriginal(): Promise<void> {
    const source = sourceFileRef.current;
    if (!source) return;
    setProcessing(true);
    setError("");
    try {
      onChange(await compressImage(source, 1200, 0.82));
      setUsingOriginal(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片处理失败");
    } finally {
      setProcessing(false);
    }
  }

  function useAutoCrop(): void {
    const cropped = autoCroppedBlobRef.current;
    if (!cropped) return;
    onChange(cropped);
    setUsingOriginal(false);
  }

  return (
    <div className="image-picker">
      <button
        type="button"
        disabled={processing}
        onClick={() => inputRef.current?.click()}
        className={`image-picker-button relative flex w-full items-center justify-center overflow-hidden rounded-[22px] border border-dashed border-separator bg-background text-muted shadow-inner active:bg-separator/40 disabled:opacity-60 ${
          preview ? "h-44" : "h-24"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1">
            <CameraIcon size={24} strokeWidth={1.5} />
            <span className="text-[12px]">{label}</span>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {processing && (
        <p role="status" className="mt-2 text-xs text-muted">
          正在自动检查并压缩图片…
        </p>
      )}
      {!processing && hasAutoCrop && (
        <div className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-[20px] bg-background px-3 py-2 text-xs text-label">
          <span>{usingOriginal ? "当前使用原图" : "已自动裁去截图黑边"}</span>
          <button
            type="button"
            onClick={usingOriginal ? useAutoCrop : () => void selectOriginal()}
            className="min-h-11 shrink-0 font-medium underline underline-offset-2"
          >
            {usingOriginal ? "恢复自动裁剪" : "使用原图"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
