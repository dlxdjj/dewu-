// OCR：tesseract.js 客户端识别 + 订单文本字段提取
// 说明：纯浏览器端识别（chi_sim + eng），准确率受截图清晰度影响，
// 结果必须经过用户确认后才写入，流程为「识别 → 校对 → 回填添加页」。
import type { Platform } from "@/lib/constants/platform";

export interface OcrPrefill {
  productName?: string;
  styleCode?: string;
  platform?: Platform;
  unitPrice?: string;
  quantity?: string;
  size?: string;
  orderNo?: string;
}

export const OCR_PREFILL_KEY = "pms_ocr_prefill";

/** 对图片做 OCR（首次调用需下载语言包，进度 0~1） */
export async function recognizeText(
  image: Blob,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["chi_sim", "eng"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/** 从订单截图文本中提取字段（尽力而为，返回可回填的表单值） */
export function parseOrderText(text: string): OcrPrefill {
  const t = text.replace(/[ \t]+/g, " ");
  const lines = t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: OcrPrefill = {};

  // 平台
  if (/唯品会/.test(t)) out.platform = "vipshop";
  else if (/拼多多|百亿补贴/.test(t)) out.platform = "pdd";
  else if (/京东|JD\.COM/i.test(t)) out.platform = "jd";
  else if (/淘宝|天猫|taobao|tmall/i.test(t)) out.platform = "taobao";

  // 价格：优先「实付/合计」行，其次第一个 ¥ 数字
  const paidLine = t.match(/实[付付款]|合计|应付.{0,12}?([0-9]+(?:\.[0-9]{1,2})?)/);
  const anyPrice = t.match(/[¥￥]\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  const priceStr = paidLine?.[1] ?? anyPrice?.[1];
  if (priceStr) out.unitPrice = priceStr;

  // 数量：x2 / ×2 / 数量 2
  const qty = t.match(/[xX×]\s*([1-9][0-9]?)\b/) ?? t.match(/数\s*量.{0,6}?([1-9][0-9]?)\b/);
  if (qty) out.quantity = qty[1];

  // 尺码：42.5码 / 尺码:L / 尺码 265
  const size =
    t.match(/尺\s*[码寸]\s*[:：]?\s*([0-9]{2,3}(?:\.5)?|[A-Z]{1,3})\b/) ??
    t.match(/\b([0-9]{2}(?:\.5)?)\s*码/);
  if (size) out.size = size[1];

  // 货号：货号:xxx 或 形如 CW2288-111 / DD1391-100
  const style =
    t.match(/货\s*[号款]\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9\-]{3,})/) ??
    t.match(/\b([A-Z]{1,3}[0-9]{3,}[0-9A-Z]*-[0-9A-Z]{2,})\b/);
  if (style) out.styleCode = style[1];

  // 订单号：订单编号/订单号 后的一串数字
  const order = t.match(/订单\s*(?:编\s*号|号)?\s*[:：]?\s*([0-9]{10,})/);
  if (order) out.orderNo = order[1];

  // 品名：最长的中文行（排除含订单/支付/物流等关键字的行）
  const nameLine = lines
    .filter(
      (l) =>
        /[一-龥]{4,}/.test(l) &&
        l.length <= 60 &&
        !/订单|支付|实付|合计|物流|收货|地址|电话|手机|店铺|发票|优惠|运费|尺码|货号|数量/.test(l),
    )
    .sort((a, b) => b.length - a.length)[0];
  if (nameLine) out.productName = nameLine.replace(/[¥￥][0-9.]+/g, "").trim();

  return out;
}
