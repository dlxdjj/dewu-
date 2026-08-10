"use client";
import { useState } from "react";
import Sheet from "./Sheet";
import type { InventoryUnit } from "@/lib/types/database";
import { getDb } from "@/lib/data";
import { settleUnits } from "@/lib/services/status";
import { todayStr } from "@/lib/utils/format";

export default function SaleFormSheet({ units,onClose,onDone }: { units: InventoryUnit[]; onClose:()=>void; onDone:(message:string,to:"settled")=>Promise<void>|void; }) { const [payout,setPayout]=useState(""); const [date,setDate]=useState(todayStr()); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); return <Sheet open title={units.length>1?`登记到手价（${units.length} 件）`:"登记到手价"} onClose={onClose}><div className="space-y-3"><label className="block text-sm">实际到手价（元{units.length>1?"/件":""}）<input aria-label="实际到手价" inputMode="decimal" value={payout} onChange={(event)=>setPayout(event.target.value)} className="mt-1 w-full rounded-xl bg-background px-3 py-3" placeholder="0.00"/></label><label className="block text-sm">结算日期<input aria-label="结算日期" type="date" value={date} onChange={(event)=>setDate(event.target.value)} className="mt-1 w-full rounded-xl bg-background px-3 py-3"/></label>{error&&<p role="alert" className="text-center text-sm text-danger">{error}</p>}<button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await settleUnits(getDb(),units.map((unit)=>unit.id),payout,date);await onDone(`已结算 ${units.length} 件`,"settled");}catch(reason){setError(reason instanceof Error?reason.message:"结算失败");}finally{setBusy(false);}}} className="w-full rounded-xl bg-tint py-3 font-medium text-white disabled:opacity-40">{busy?"提交中…":"确认到手价并结算"}</button></div></Sheet>; }
