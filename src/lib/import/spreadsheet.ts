import type { CellValue, SheetData } from "read-excel-file/browser";
import type { SpreadsheetImportRow } from "@/lib/data/types";
import { parseYuanToCents } from "@/lib/utils/money";

export interface SpreadsheetParseError {
  rowNumber: number;
  message: string;
}

export interface SpreadsheetPreview {
  rows: SpreadsheetImportRow[];
  errors: SpreadsheetParseError[];
  totalUnits: number;
  totalCostCents: number;
  headerRowNumber: number | null;
}

export interface ReadSpreadsheetResult extends SpreadsheetPreview {
  fileHash: string;
}

type Field = "styleCode" | "productName" | "quantity" | "unitPrice" | "size";
type SheetCell = CellValue | null;

const HEADERS: Record<Field, string[]> = {
  styleCode: ["货号", "款号", "商品货号", "sku", "skuid"],
  productName: ["货品名称", "商品名称", "品名", "名称"],
  quantity: ["数量", "库存数量", "件数"],
  unitPrice: ["进价", "实际进价", "采购价", "采购价格", "零售价"],
  size: ["尺码", "规格", "size"],
};

function headerKey(value: SheetCell): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s（）()：:]/g, "");
}

function findColumns(row: readonly SheetCell[]): Partial<Record<Field, number>> {
  const result: Partial<Record<Field, number>> = {};
  row.forEach((cell, index) => {
    const key = headerKey(cell);
    for (const field of Object.keys(HEADERS) as Field[]) {
      if (result[field] == null && HEADERS[field].includes(key)) result[field] = index;
    }
  });
  return result;
}

function cellText(value: SheetCell): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseQuantity(value: SheetCell): number {
  if (typeof value === "number") return value;
  const text = cellText(value).replace(/件$/, "").trim();
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

function priceText(value: SheetCell): string {
  if (typeof value === "number") return value.toFixed(2);
  let text = cellText(value).replace(/[¥￥元\s]/g, "");
  if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(",", ".");
  else text = text.replace(/,/g, "");
  return text;
}

export function parseSpreadsheetRows(data: SheetData): SpreadsheetPreview {
  const scanLimit = Math.min(data.length, 20);
  let headerIndex = -1;
  let columns: Partial<Record<Field, number>> = {};
  for (let index = 0; index < scanLimit; index += 1) {
    const candidate = findColumns(data[index] ?? []);
    if (
      candidate.styleCode != null && candidate.productName != null &&
      candidate.quantity != null && candidate.unitPrice != null
    ) {
      headerIndex = index;
      columns = candidate;
      break;
    }
  }

  // The promised compact template is A-D, with optional size in E.
  if (headerIndex < 0) {
    columns = { styleCode: 0, productName: 1, quantity: 2, unitPrice: 3, size: 4 };
  }

  const rows: SpreadsheetImportRow[] = [];
  const errors: SpreadsheetParseError[] = [];
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  for (let index = start; index < data.length; index += 1) {
    const source = data[index] ?? [];
    const relevant = [
      source[columns.styleCode!], source[columns.productName!],
      source[columns.quantity!], source[columns.unitPrice!],
    ];
    if (relevant.every((value) => cellText(value) === "")) continue;

    const rowNumber = index + 1;
    const styleCode = cellText(source[columns.styleCode!]);
    const productName = cellText(source[columns.productName!]);
    const quantity = parseQuantity(source[columns.quantity!]);
    let unitPriceCents = Number.NaN;
    try {
      unitPriceCents = parseYuanToCents(priceText(source[columns.unitPrice!]));
    } catch {
      // The row-level error below gives the user the Excel row number.
    }
    const size = columns.size == null ? "" : cellText(source[columns.size]);

    if (!styleCode) errors.push({ rowNumber, message: "缺少货号" });
    if (!productName) errors.push({ rowNumber, message: "缺少货品名称" });
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
      errors.push({ rowNumber, message: "数量必须是 1 至 999 的整数" });
    }
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
      errors.push({ rowNumber, message: "进价格式不正确" });
    }
    if (
      styleCode && productName && Number.isSafeInteger(quantity) && quantity >= 1 &&
      quantity <= 999 && Number.isSafeInteger(unitPriceCents) && unitPriceCents >= 0
    ) {
      rows.push({ rowNumber, styleCode, productName, quantity, unitPriceCents, size });
    }
  }

  return {
    rows,
    errors,
    totalUnits: rows.reduce((sum, row) => sum + row.quantity, 0),
    totalCostCents: rows.reduce(
      (sum, row) => sum + row.quantity * row.unitPriceCents,
      0,
    ),
    headerRowNumber: headerIndex >= 0 ? headerIndex + 1 : null,
  };
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function readSpreadsheet(file: File): Promise<ReadSpreadsheetResult> {
  if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
    throw new Error("请上传 .xlsx 格式的 Excel 文件");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("表格不能超过 15MB，请拆分后再导入");
  }
  const buffer = await file.arrayBuffer();
  const [reader, fileHash] = await Promise.all([
    import("read-excel-file/browser"),
    sha256(buffer),
  ]);
  const data = await reader.readSheet(buffer);
  return { ...parseSpreadsheetRows(data), fileHash };
}
