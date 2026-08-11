import { describe, expect, it } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import { saveMonthlyRebates } from "./rebate";

describe("monthly rebates", () => {
  it("saves and updates both monthly sources without duplicates", async () => {
    const db = new MemoryDbAdapter();

    await saveMonthlyRebates(db, {
      month: "2026-08",
      taobaoAllianceYuan: "12.34",
      jingfenYuan: "5",
    });
    await saveMonthlyRebates(db, {
      month: "2026-08",
      taobaoAllianceYuan: "20",
      jingfenYuan: "",
    });

    expect(db.snapshot().rebates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          month: "2026-08-01",
          source: "taobao_alliance",
          amount_cents: 2000,
        }),
        expect.objectContaining({
          month: "2026-08-01",
          source: "jingfen",
          amount_cents: 0,
        }),
      ]),
    );
    expect(db.snapshot().rebates).toHaveLength(2);
  });

  it("validates the month and money values", async () => {
    const db = new MemoryDbAdapter();
    await expect(
      saveMonthlyRebates(db, {
        month: "2026-13",
        taobaoAllianceYuan: "1",
        jingfenYuan: "2",
      }),
    ).rejects.toThrow("返利月份格式不正确");
    await expect(
      saveMonthlyRebates(db, {
        month: "2026-08",
        taobaoAllianceYuan: "-1",
        jingfenYuan: "2",
      }),
    ).rejects.toThrow();
  });

  it("rolls back both sources if one write fails", async () => {
    const db = new MemoryDbAdapter();
    const before = db.snapshot();
    db.injectFailureAfter(2);

    await expect(
      saveMonthlyRebates(db, {
        month: "2026-08",
        taobaoAllianceYuan: "10",
        jingfenYuan: "20",
      }),
    ).rejects.toThrow("注入事务故障");
    expect(db.snapshot()).toEqual(before);
  });
});
