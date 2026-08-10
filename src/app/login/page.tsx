"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword } from "@/lib/supabase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setMessage("");
    try { await signInWithPassword(email, password); router.replace("/"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto mt-20 max-w-sm rounded-2xl bg-card p-5 shadow-sm">
    <h1 className="text-xl font-bold">登录进销存</h1><p className="mt-1 text-sm text-muted">使用邮箱和密码登录</p>
    <input aria-label="邮箱" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-5 w-full rounded-xl bg-background px-3 py-3" placeholder="name@example.com" />
    <input aria-label="密码" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-3 w-full rounded-xl bg-background px-3 py-3" placeholder="密码" />
    <button type="button" disabled={busy} onClick={() => void submit()} className="mt-3 w-full rounded-xl bg-tint py-3 font-medium text-white disabled:opacity-40">{busy ? "登录中…" : "登录"}</button>
    {message && <p className="mt-3 text-center text-sm text-muted">{message}</p>}
  </section>;
}
