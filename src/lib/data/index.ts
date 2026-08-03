import { createSupabaseAdapter } from "@/lib/data/cloud";
import { ConfigurationError } from "@/lib/data/errors";
import type { DbAdapter } from "@/lib/data/types";
import { isSupabaseConfigured } from "@/lib/supabase/client";

let adapter: DbAdapter | null = null;
export function getDb(): DbAdapter { if (!isSupabaseConfigured) throw new ConfigurationError(); adapter ??= createSupabaseAdapter(); return adapter; }
export function dbKind(): "supabase" | "unconfigured" { return isSupabaseConfigured ? "supabase" : "unconfigured"; }
/** Test-only injection; production code never calls this. */
export function setDbForTests(testAdapter: DbAdapter | null): void { if (process.env.NODE_ENV !== "test") throw new Error("仅测试环境可注入数据源"); adapter = testAdapter; }
