"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword } from "@/lib/supabase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await signInWithPassword(email, password);
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center py-8">
      <section className="w-full max-w-sm rounded-[28px] border border-separator bg-card p-6 shadow-[var(--cirrus-shadow-2)]">
        <h1 className="text-xl font-bold">登录进销存</h1>
        <p id="login-help" className="mt-1 text-sm text-muted">使用邮箱和密码登录</p>
        <form onSubmit={submit} aria-describedby="login-help" aria-busy={busy}>
          <label className="mt-5 block text-sm">
            邮箱
            <input
              aria-label="邮箱"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl bg-background px-3 py-3"
              placeholder="name@example.com"
            />
          </label>
          <label className="mt-3 block text-sm">
            密码
            <input
              aria-label="密码"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl bg-background px-3 py-3"
            />
          </label>
          {message && (
            <p role="alert" aria-live="assertive" className="mt-3 text-center text-sm text-danger">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-full bg-tint py-3.5 font-medium text-white shadow-[var(--cirrus-shadow-2)] disabled:opacity-40"
          >
            {busy ? "登录中…" : "登录"}
          </button>
        </form>
      </section>
    </div>
  );
}
