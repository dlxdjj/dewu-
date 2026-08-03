import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

interface AuthCallbackClient {
  exchangeCodeForSession(code: string): PromiseLike<{
    data: { session: Session | null };
    error: Error | null;
  }>;
  setSession(tokens: {
    access_token: string;
    refresh_token: string;
  }): PromiseLike<{
    data: { session: Session | null };
    error: Error | null;
  }>;
}
import { getSupabase } from "@/lib/supabase/client";

export const AUTH_REQUEST_TIMEOUT_MS = 12_000;
const LOCALHOST = "localhost";
const LOOPBACK_IPV4 = "127.0.0.1";

/** Error raised when Supabase Auth does not settle within the UI deadline. */
export class AuthTimeoutError extends Error {
  constructor() {
    super("登录状态检查超时，请检查网络后重试。");
    this.name = "AuthTimeoutError";
  }
}

/** Reject a request that exceeds the authentication UI deadline. */
export function withAuthTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new AuthTimeoutError()),
      AUTH_REQUEST_TIMEOUT_MS,
    );
    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

/** Return the current browser session, failing instead of loading forever. */
export async function getSession(): Promise<Session | null> {
  const response = await withAuthTimeout(getSupabase().auth.getSession());
  if (response.error) throw response.error;
  return response.data.session;
}

/** Subscribe to Supabase Auth changes and return a cleanup callback. */
export function onAuthSessionChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const { data } = getSupabase().auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

/** Extract a safe, user-readable error from an OAuth/OTP callback URL. */
export function getAuthCallbackError(location: Location = window.location): string {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const description =
    search.get("error_description") ?? hash.get("error_description");
  const errorCode = search.get("error_code") ?? hash.get("error_code");
  if (!description && !errorCode) return "";
  try {
    return decodeURIComponent(description ?? errorCode ?? "登录链接无效");
  } catch {
    return description ?? errorCode ?? "登录链接无效";
  }
}

/** Return whether the URL contains a Supabase Auth callback payload. */
export function hasAuthCallback(location: Location = window.location): boolean {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  return Boolean(
    search.get("code") ||
      search.get("error") ||
      hash.get("access_token") ||
      hash.get("error"),
  );
}

/** Keep localhost and 127.0.0.1 from splitting persisted browser sessions. */
export function getCanonicalLocalUrl(location: Location = window.location): string {
  if (location.hostname !== LOOPBACK_IPV4) return "";
  const canonicalUrl = new URL(location.href);
  canonicalUrl.hostname = LOCALHOST;
  return canonicalUrl.toString();
}

/** Decide the client route after a session check. */
export function getSessionDestination(
  session: Session | null,
  pathname: string,
): string {
  if (!session && pathname !== "/login") return "/login";
  if (session && pathname === "/login") return "/";
  return "";
}

/** Remove one-time credentials from browser history after callback handling. */
function clearAuthCallbackUrl(): void {
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname,
  );
}

/**
 * Complete a PKCE or implicit Magic Link callback before the gate reads session.
 * Returns null when the current URL is not an authentication callback.
 */
export async function completeAuthCallback(
  auth?: AuthCallbackClient,
): Promise<Session | null> {
  const callbackError = getAuthCallbackError();
  if (callbackError) throw new Error(`登录链接处理失败：${callbackError}`);

  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = search.get("code");
  if (code) {
    const response = await withAuthTimeout(
      (auth ?? getSupabase().auth).exchangeCodeForSession(code),
    );
    if (response.error) throw response.error;
    clearAuthCallbackUrl();
    return response.data.session;
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const response = await withAuthTimeout(
      (auth ?? getSupabase().auth).setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    );
    if (response.error) throw response.error;
    clearAuthCallbackUrl();
    return response.data.session;
  }

  if (hasAuthCallback()) {
    throw new Error("登录回调缺少有效会话信息，链接可能已过期或已被使用。");
  }
  return null;
}

/** Send a Magic Link using the configured or canonical current origin. */
export async function signInWithMagicLink(email: string): Promise<void> {
  const value = email.trim();
  if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error("请输入有效邮箱");
  const configuredRedirect = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL?.trim();
  const canonicalLocalUrl = getCanonicalLocalUrl();
  const redirectTo =
    configuredRedirect ||
    (canonicalLocalUrl
      ? new URL(canonicalLocalUrl).origin
      : window.location.origin);
  const response = await withAuthTimeout(
    getSupabase().auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: redirectTo },
    }),
  );
  if (response.error) throw response.error;
}

/** Sign out of the active Supabase browser session. */
export async function signOut(): Promise<void> {
  const response = await withAuthTimeout(getSupabase().auth.signOut());
  if (response.error) throw response.error;
}
