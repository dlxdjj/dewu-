// 数据源选择：配置了 Supabase 环境变量 → 云端；否则 → 浏览器本地
// （createSupabaseAdapter 内部才会读取环境变量，未配置时不会被调用）
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createLocalAdapter } from "./local";
import { createSupabaseAdapter } from "./cloud";
import type { DbAdapter } from "./types";

let adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (!adapter) {
    adapter = isSupabaseConfigured
      ? createSupabaseAdapter()
      : createLocalAdapter();
  }
  return adapter;
}

export function dbKind(): "local" | "supabase" {
  return isSupabaseConfigured ? "supabase" : "local";
}
