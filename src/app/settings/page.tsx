"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import ThemePicker from "@/components/settings/ThemePicker";
import { dbKind, getDb } from "@/lib/data";
import {
  clearAllData,
  retryStorageCleanup,
} from "@/lib/services/maintenance";
import { getSession, signOut } from "@/lib/supabase/auth";

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSession().then((session) => setEmail(session?.user.email ?? ""));
    const notice = sessionStorage.getItem("pms_cleanup_notice");
    if (notice) queueMicrotask(() => setMessage(notice));
  }, []);

  async function handleStorageCleanup(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const result = await retryStorageCleanup(getDb());
      setMessage(`清理完成 ${result.completed}，待清理 ${result.pending}`);
      sessionStorage.removeItem("pms_cleanup_notice");
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "清理失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAllData(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const result = await clearAllData(getDb(), confirmation);
      setMessage(
        result.pendingStoragePaths.length
          ? `数据已清空，仍有 ${result.pendingStoragePaths.length} 个附件待清理。`
          : "全部数据已清空。",
      );
      setConfirmation("");
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "清空失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <PageHeader title="设置" subtitle="账户、数据维护与危险操作" />
      <div className="settings-grid grid gap-3 md:grid-cols-2">
        <Card className="space-y-2 text-sm">
          <h2 className="font-medium">账户与数据源</h2>
          <p>
            数据源：
            {dbKind() === "supabase" ? "Supabase 已连接" : "Supabase 未配置"}
          </p>
          <p className="text-muted">账户：{email || "加载中…"}</p>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
            className="text-tint"
          >
            退出登录
          </button>
        </Card>

        <Card>
          <ThemePicker />
        </Card>

        <Card>
          <h2 className="font-medium">附件清理</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            附件删除失败时会保留待处理任务，可稍后重试，不影响其他数据。
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handleStorageCleanup}
            className="mt-3 text-sm text-tint disabled:opacity-40"
          >
            {busy ? "处理中…" : "重试附件清理"}
          </button>
        </Card>

        <Card className="border border-danger/30 md:col-span-2">
          <h2 className="font-medium text-danger">清空全部数据</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            删除当前账户的商品、批次、单件、销售、返利、历史和附件元数据。此操作无法撤销。
          </p>
          <label className="mt-3 block text-sm">
            确认词（必填）
            <input
              aria-label="清空确认词"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 w-full rounded-xl bg-background px-3 py-3"
              placeholder="请输入“清空”"
            />
          </label>
          <button
            type="button"
            disabled={busy || confirmation !== "清空"}
            onClick={handleClearAllData}
            className="mt-3 w-full rounded-xl bg-danger py-3 text-white disabled:opacity-40"
          >
            {busy ? "处理中…" : "确认清空全部数据"}
          </button>
        </Card>
      </div>
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-center text-sm text-muted"
        >
          {message}
        </p>
      )}
    </div>
  );
}
