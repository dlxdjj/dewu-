import { describe, expect, it } from "vitest";
import { parseOrderText, recognizeText } from "./ocr";

describe("parseOrderText", () => {
  it("extracts common order fields from a Chinese marketplace receipt", () => {
    expect(
      parseOrderText(`
        拼多多 百亿补贴
        adidas TAEKWONDO 舒适百搭低帮休闲鞋
        货号：JQ3606
        尺码：36.5
        数量：2
        实付 ¥399.90
        订单编号：2408101234567890
      `),
    ).toEqual({
      platform: "pdd",
      unitPrice: "399.90",
      quantity: "2",
      size: "36.5",
      styleCode: "JQ3606",
      orderNo: "2408101234567890",
      productName: "adidas TAEKWONDO 舒适百搭低帮休闲鞋",
    });
  });

  it.each([
    ["京东 JD.COM", "jd"],
    ["唯品会特卖", "vipshop"],
    ["天猫旗舰店", "taobao"],
  ] as const)("maps %s to %s", (text, platform) => {
    expect(parseOrderText(text).platform).toBe(platform);
  });
});

describe("recognizeText", () => {
  it("rejects an empty image before loading the OCR worker", async () => {
    await expect(recognizeText(new Blob())).rejects.toThrow(
      "图片为空，请重新选择",
    );
  });
});
