"use client";
import { useMemo, useState } from "react";
import Sheet from "./Sheet";
import type { InventoryUnit } from "@/lib/types/database";
import { previewShipping } from "@/lib/services/shipping";
import { formatCents } from "@/lib/utils/money";

export default function BatchShippingSheet({ units, onClose, onConfirm }: { units: InventoryUnit[]; onClose: () => void; onConfirm: (totalShippingCents: number, overwriteConfirmed: boolean) => Promise<void>; }) {
  const [amount,setAmount]=useState(""); const [overwrite,setOverwrite]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const preview=useMemo(()=>{try{return amount?previewShipping(units,amount):null;}catch{return null;}},[amount,units]);
  return <Sheet open title={`批量寄出（${units.length} 件）`} onClose={onClose}><div className="space-y-3"><label className="block text-sm">总快递费（元）<input aria-label="总快递费" inputMode="decimal" value={amount} onChange={(event)=>{setAmount(event.target.value);setOverwrite(false);}} className="mt-1 w-full rounded-xl bg-background px-3 py-3" placeholder="0.00"/></label>{preview&&<div className="rounded-xl bg-background p-3 text-sm"><p>分摊合计：{formatCents(preview.totalShippingCents)}</p><div className="mt-2 max-h-28 overflow-y-auto text-xs text-muted">{preview.allocations.map((item,index)=><p key={item.unitId}>第 {index+1} 件：{formatCents(item.shippingCents)}</p>)}</div><p className="mt-2 text-xs text-muted">确认后状态将直达“发往得物途中”。</p></div>}{preview?.hasOverwrite&&!overwrite&&<button type="button" onClick={()=>setOverwrite(true)} className="w-full rounded-xl bg-[#FFF3CD] py-3 text-sm text-[#8a6d00]">确认覆盖原分摊值</button>}{error&&<p role="alert" className="text-center text-sm text-danger">{error}</p>}<button type="button" disabled={!preview||busy||(preview.hasOverwrite&&!overwrite)} onClick={async()=>{if(!preview)return;setBusy(true);setError("");try{await onConfirm(preview.totalShippingCents,overwrite);}catch(reason){setError(reason instanceof Error?reason.message:"寄出失败");}finally{setBusy(false);}}} className="w-full rounded-xl bg-tint py-3 font-medium text-white disabled:opacity-40">{busy?"提交中…":"确认寄出并均摊"}</button></div></Sheet>;
}
