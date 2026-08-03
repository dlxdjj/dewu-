import { afterEach, describe, expect, it, vi } from "vitest";

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  vi.resetModules();
});

describe("production data source", () => {
  it("blocks when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    vi.resetModules();
    const { ConfigurationError } = await import("./errors");
    const { dbKind, getDb } = await import("./index");
    expect(dbKind()).toBe("unconfigured");
    expect(() => getDb()).toThrow(ConfigurationError);
  });
});
