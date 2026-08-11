import type { DbAdapter } from "@/lib/data/types";
import type { MonthlyRebate } from "@/lib/types/database";
import { parseYuanToCents } from "@/lib/utils/money";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function saveMonthlyRebates(
  db: DbAdapter,
  input: {
    month: string;
    taobaoAllianceYuan: string;
    jingfenYuan: string;
  },
): Promise<MonthlyRebate[]> {
  if (!MONTH_PATTERN.test(input.month)) {
    throw new Error("返利月份格式不正确");
  }
  return db.saveMonthlyRebates({
    month: `${input.month}-01`,
    taobaoAllianceCents: parseYuanToCents(
      input.taobaoAllianceYuan.trim() || "0",
    ),
    jingfenCents: parseYuanToCents(input.jingfenYuan.trim() || "0"),
  });
}
