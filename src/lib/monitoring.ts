import { getSupabase } from "@/lib/supabase/client";

export type ClientEventKind = "error" | "slow_request" | "image_error";
const SLOW_REQUEST_MS = 1_500;
const recent = new Map<string, number>();

function cleanMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "未知错误");
  return raw
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(token|key|password)=?[^\s&]*/gi, "$1=[redacted]")
    .slice(0, 500);
}

export function recordClientEvent(
  kind: ClientEventKind,
  message: unknown,
  options: { durationMs?: number; metadata?: Record<string, unknown> } = {},
): void {
  if (typeof window === "undefined") return;
  const cleaned = cleanMessage(message);
  const signature = `${kind}:${cleaned}`;
  const now = Date.now();
  if (now - (recent.get(signature) ?? 0) < 60_000) return;
  recent.set(signature, now);
  void (async () => {
    try {
      const client = getSupabase();
      const auth = await client.auth.getUser();
      const userId = auth.data.user?.id;
      if (!userId) return;
      await client.from("client_events").insert({
        user_id: userId,
        kind,
        route: window.location.pathname.slice(0, 200),
        message: cleaned,
        duration_ms: options.durationMs == null
          ? null
          : Math.max(0, Math.round(options.durationMs)),
        metadata: options.metadata ?? {},
      });
    } catch {
      // Monitoring must never create another user-facing failure.
    }
  })();
}

export async function monitoredRequest<T>(
  name: string,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await work();
    const duration = performance.now() - started;
    if (duration >= SLOW_REQUEST_MS) {
      recordClientEvent("slow_request", name, {
        durationMs: duration,
        metadata: { request: name },
      });
    }
    return result;
  } catch (error) {
    recordClientEvent("error", error, { metadata: { request: name } });
    throw error;
  }
}
