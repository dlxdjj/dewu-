"use client";

import { useEffect, useMemo, useRef } from "react";
import { CameraIcon } from "./icons";

/** 图片选择（拍照/相册），自动压缩到最长边 1200px 的 JPEG */
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

  // 由 value 派生预览 URL，并在变化时释放旧 URL
  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    onChange(await compressImage(file, 1200, 0.82));
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-separator bg-background text-muted active:bg-separator/40"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-full w-full object-cover" />
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
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

/** canvas 压缩图片 */
export function compressImage(
  file: Blob,
  maxSide: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas 不可用"));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("图片压缩失败"))),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    img.src = url;
  });
}
