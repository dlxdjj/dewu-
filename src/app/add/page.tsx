"use client";

import { useRouter } from "next/navigation";
import PurchaseForm from "@/components/add/PurchaseForm";
import SpreadsheetImport from "@/components/add/SpreadsheetImport";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { useAppData } from "@/components/AppDataProvider";

export default function AddPage() {
  const router = useRouter();
  const shared = useAppData();
  if (!shared?.data) {
    return (
      <>
        <PageHeader title="添加" subtitle="正在读取当前账号的录入方式…" />
        <Card>
          <p className={shared?.error ? "text-sm text-danger" : "text-sm text-muted"}>
            {shared?.error || "加载中…"}
          </p>
        </Card>
      </>
    );
  }
  const bulk = shared?.data?.preferences.workflow === "bulk";
  if (!bulk) {
    return <PurchaseForm onComplete={() => router.push("/inventory")} />;
  }
  return (
    <>
      <PageHeader title="添加" subtitle="表格导入或单件录入，尺码可以后补" />
      <SpreadsheetImport onImported={() => shared?.refresh()} />
      <details className="rounded-2xl border border-separator bg-card p-4 shadow-[var(--cirrus-shadow-1)]">
        <summary className="cursor-pointer font-medium">单件录入</summary>
        <div className="mt-4">
          <PurchaseForm
            showHeader={false}
            showPlatform={false}
            allowMissingSize
            onComplete={() => router.push("/inventory")}
          />
        </div>
      </details>
    </>
  );
}
