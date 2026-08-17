import { describe, expect, it } from "vitest";
import { parseSpreadsheetRows } from "./spreadsheet";

describe("spreadsheet purchase parser", () => {
  it("reads the compact A-D template and leaves size pending", () => {
    const parsed = parseSpreadsheetRows([
      ["货号", "货品名称", "数量", "进价"],
      ["HP5969", "阿迪达斯运动鞋", 2, 399.9],
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([{
      rowNumber: 2,
      styleCode: "HP5969",
      productName: "阿迪达斯运动鞋",
      quantity: 2,
      unitPriceCents: 39990,
      size: "",
    }]);
    expect(parsed.totalUnits).toBe(2);
    expect(parsed.totalCostCents).toBe(79980);
  });

  it("recognizes arbitrary columns, the historical 零售价 header, and size", () => {
    const parsed = parseSpreadsheetRows([
      ["备注", "尺码", "货品名称", "零售价", "货号", "数量"],
      ["", "42", "测试鞋", "299,50", "AB-1", "3"],
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      styleCode: "AB-1", productName: "测试鞋", quantity: 3,
      unitPriceCents: 29950, size: "42",
    });
  });

  it("reports row-specific errors without accepting partial invalid rows", () => {
    const parsed = parseSpreadsheetRows([
      ["货号", "货品名称", "数量", "进价", "尺码"],
      ["", "测试鞋", 0, "abc", ""],
    ]);
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors.map((error) => error.message)).toEqual([
      "缺少货号",
      "数量必须是 1 至 999 的整数",
      "进价格式不正确",
    ]);
  });
});
