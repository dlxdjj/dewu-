"use client";
import Sheet from "./Sheet";
import type { InventoryUnit } from "@/lib/types/database";
export default function DeleteUnitSheet({unit,onClose,onConfirm,busy=false}:{unit:InventoryUnit;onClose:()=>void;onConfirm:()=>Promise<void>;busy?:boolean}) { const affectsProfit=unit.status==="sold"||unit.status==="settled"; return <Sheet open title="删除此记录" onClose={onClose}><div className="space-y-3"><p className="text-sm leading-6 text-muted">此操作会永久删除该单件及关联销售、状态历史和附件元数据，无法撤销。{affectsProfit&&<span className="block text-danger">该件已售出/结算，删除会影响历史利润和报表。</span>}</p><button type="button" disabled={busy} onClick={onConfirm} className="w-full rounded-xl bg-danger py-3 font-medium text-white disabled:opacity-40">确认永久删除</button></div></Sheet>; }
