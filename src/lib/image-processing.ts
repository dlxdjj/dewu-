export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProductImageResult {
  blob: Blob;
  cropApplied: boolean;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}

interface PixelBuffer {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

const ANALYSIS_WIDTH = 256;
const DARK_PIXEL_LUMA = 58;
const DARK_ROW_PIXEL_RATIO = 0.78;
const DARK_ROW_MEAN_LUMA = 68;

/**
 * Detects the large dark top/bottom panels around a product image screenshot.
 * Both edge panels must be present, so a dark product on a normal background is
 * not mistaken for screenshot chrome.
 */
export function detectScreenshotBars(
  pixels: PixelBuffer,
): CropRect | null {
  const { data, width, height } = pixels;
  if (width < 8 || height < 16 || height / width < 1.35) return null;

  const darkRows: boolean[] = [];
  const rowMeanLuma: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let darkPixels = 0;
    let totalLuma = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luma =
        ((data[offset] ?? 0) * 299 +
          (data[offset + 1] ?? 0) * 587 +
          (data[offset + 2] ?? 0) * 114) /
        1000;
      totalLuma += luma;
      if (luma <= DARK_PIXEL_LUMA) darkPixels += 1;
    }
    const mean = totalLuma / width;
    rowMeanLuma.push(mean);
    darkRows.push(
      darkPixels / width >= DARK_ROW_PIXEL_RATIO &&
        mean <= DARK_ROW_MEAN_LUMA,
    );
  }

  const minEdgeBand = Math.max(4, Math.round(height * 0.07));
  const minContentHeight = Math.max(8, Math.round(height * 0.2));
  const runs = nonDarkRuns(darkRows).filter(
    (run) => run.end - run.start >= minContentHeight,
  );

  let best: { start: number; end: number; score: number } | null = null;
  for (const run of runs) {
    const topHeight = run.start;
    const bottomHeight = height - run.end;
    if (topHeight < minEdgeBand || bottomHeight < minEdgeBand) continue;

    const topDarkRatio = trueRatio(darkRows, 0, run.start);
    const bottomDarkRatio = trueRatio(darkRows, run.end, height);
    if (topDarkRatio < 0.76 || bottomDarkRatio < 0.76) continue;

    const contentMean = mean(rowMeanLuma, run.start, run.end);
    const edgeMean =
      (mean(rowMeanLuma, 0, run.start) +
        mean(rowMeanLuma, run.end, height)) /
      2;
    if (contentMean < 105 || contentMean - edgeMean < 70) continue;

    const removedRatio = (topHeight + bottomHeight) / height;
    if (removedRatio < 0.25) continue;

    const score =
      run.end - run.start +
      (topDarkRatio + bottomDarkRatio) * height * 0.15;
    if (!best || score > best.score) best = { ...run, score };
  }

  if (!best) return null;
  return {
    x: 0,
    y: best.start,
    width,
    height: best.end - best.start,
  };
}

/** Compress without cropping. OCR uses this path to keep the complete screenshot. */
export async function compressImage(
  file: Blob,
  maxSide: number,
  quality: number,
): Promise<Blob> {
  return (await renderImage(file, maxSide, quality, false)).blob;
}

/** Product-image path: detect screenshot bars, then crop and compress once. */
export function prepareProductImage(
  file: Blob,
  maxSide = 1200,
  quality = 0.82,
): Promise<ProductImageResult> {
  return renderImage(file, maxSide, quality, true);
}

async function renderImage(
  file: Blob,
  maxSide: number,
  quality: number,
  autoCrop: boolean,
): Promise<ProductImageResult> {
  const image = await loadImage(file);
  try {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("图片尺寸无效");

    const crop = autoCrop ? findCropOnImage(image) : null;
    const source = crop ?? {
      x: 0,
      y: 0,
      width: sourceWidth,
      height: sourceHeight,
    };
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const outputWidth = Math.max(1, Math.round(source.width * scale));
    const outputHeight = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas 不可用");
    context.drawImage(
      image,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      outputWidth,
      outputHeight,
    );
    const blob = await canvasToBlob(canvas, quality);
    return {
      blob,
      cropApplied: crop !== null,
      sourceWidth,
      sourceHeight,
      outputWidth,
      outputHeight,
    };
  } finally {
    image.removeAttribute("src");
  }
}

function findCropOnImage(image: HTMLImageElement): CropRect | null {
  const scale = Math.min(1, ANALYSIS_WIDTH / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);

  let detected: CropRect | null;
  try {
    detected = detectScreenshotBars(context.getImageData(0, 0, width, height));
  } catch {
    return null;
  }
  if (!detected) return null;

  const yScale = image.naturalHeight / height;
  const top = Math.max(0, Math.floor(detected.y * yScale));
  const bottom = Math.min(
    image.naturalHeight,
    Math.ceil((detected.y + detected.height) * yScale),
  );
  return {
    x: 0,
    y: top,
    width: image.naturalWidth,
    height: Math.max(1, bottom - top),
  };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片压缩失败"))),
      "image/jpeg",
      quality,
    );
  });
}

function nonDarkRuns(rows: boolean[]): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  let start: number | null = null;
  for (let index = 0; index <= rows.length; index += 1) {
    if (index < rows.length && !rows[index]) {
      start ??= index;
    } else if (start !== null) {
      result.push({ start, end: index });
      start = null;
    }
  }
  return result;
}

function trueRatio(values: boolean[], start: number, end: number): number {
  if (end <= start) return 0;
  let count = 0;
  for (let index = start; index < end; index += 1) {
    if (values[index]) count += 1;
  }
  return count / (end - start);
}

function mean(values: number[], start: number, end: number): number {
  if (end <= start) return 0;
  let total = 0;
  for (let index = start; index < end; index += 1) total += values[index];
  return total / (end - start);
}
