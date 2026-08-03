import type { ClearResult, CleanupResult, DbAdapter, DeleteResult } from "@/lib/data/types";

export async function deleteUnitDeep(db: DbAdapter, unitId: string): Promise<DeleteResult> { if (!unitId) throw new Error("缺少库存 ID"); return db.deleteUnitDeep({ unitId }); }
export async function clearAllData(db: DbAdapter, confirmation: string): Promise<ClearResult> {
  if (confirmation !== "清空") throw new Error("请输入“清空”确认操作");
  const result = await db.clearAllData({ confirmation: "清空" });
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("pms_ocr_prefill");
    Object.keys(localStorage).filter((key) => key.startsWith("pms_")).forEach((key) => localStorage.removeItem(key));
    indexedDB.deleteDatabase("dewu-pms");
  }
  return result;
}
export async function retryStorageCleanup(db: DbAdapter): Promise<CleanupResult> { return db.retryStorageCleanup(); }
