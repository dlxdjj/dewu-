import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 服务端 client（Server Component / Server Action 用）。
 * 单用户无登录：直接使用 anon key，RLS 已按单租户放开。
 * 注意：不要公开部署地址，anon key 即可读写全部数据。
 */
export function createServerSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase 未配置：请检查 .env.local");
  }
  return createClient(url, anonKey);
}
