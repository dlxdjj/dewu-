import { ConfigurationError } from "@/lib/data/errors";
import type { DbAdapter } from "@/lib/data/types";

/** @deprecated Production fallback was intentionally removed. */
export function createLocalAdapter(): DbAdapter {
  throw new ConfigurationError("本地完整数据库回退已禁用，请配置 Supabase。测试请显式使用 MemoryDbAdapter。\n");
}
