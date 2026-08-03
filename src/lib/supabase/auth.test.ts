import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthTimeoutError,
  completeAuthCallback,
  getAuthCallbackError,
  getCanonicalLocalUrl,
  getSessionDestination,
  hasAuthCallback,
  withAuthTimeout,
} from "./auth";

const authMocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
}));

function locationFor(value: string): Location {
  return new URL(value) as unknown as Location;
}

function setBrowserUrl(value: string): void {
  window.history.replaceState({}, "", value);
}

describe("Supabase Auth callback helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    setBrowserUrl("/");
  });

  it("canonicalizes 127.0.0.1 to localhost without dropping callback data", () => {
    expect(
      getCanonicalLocalUrl(
        locationFor("http://127.0.0.1:3000/?code=otp-code#section"),
      ),
    ).toBe("http://localhost:3000/?code=otp-code#section");
  });

  it("leaves non-loopback and canonical localhost origins unchanged", () => {
    expect(
      getCanonicalLocalUrl(locationFor("http://localhost:3000/?code=otp-code")),
    ).toBe("");
    expect(
      getCanonicalLocalUrl(locationFor("https://inventory.example.com/")),
    ).toBe("");
  });

  it("detects PKCE and implicit callback payloads", () => {
    expect(hasAuthCallback(locationFor("http://localhost:3000/?code=abc"))).toBe(
      true,
    );
    expect(
      hasAuthCallback(
        locationFor("http://localhost:3000/#access_token=abc&type=magiclink"),
      ),
    ).toBe(true);
    expect(hasAuthCallback(locationFor("http://localhost:3000/"))).toBe(false);
  });

  it("extracts a readable callback error", () => {
    expect(
      getAuthCallbackError(
        locationFor(
          "http://localhost:3000/?error=access_denied&error_description=Email%20link%20is%20invalid",
        ),
      ),
    ).toBe("Email link is invalid");
  });

  it("exchanges a PKCE code and clears it from browser history", async () => {
    const session = { user: { id: "user-1" } } as Session;
    authMocks.exchangeCodeForSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    setBrowserUrl("/?code=valid-code");

    await expect(completeAuthCallback(authMocks)).resolves.toBe(session);
    expect(authMocks.exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(window.location.search).toBe("");
  });

  it("establishes an implicit hash session and clears credentials", async () => {
    const session = { user: { id: "user-1" } } as Session;
    authMocks.setSession.mockResolvedValue({ data: { session }, error: null });
    setBrowserUrl("/#access_token=access&refresh_token=refresh&type=magiclink");

    await expect(completeAuthCallback(authMocks)).resolves.toBe(session);
    expect(authMocks.setSession).toHaveBeenCalledWith({
      access_token: "access",
      refresh_token: "refresh",
    });
    expect(window.location.hash).toBe("");
  });

  it("rejects callback errors instead of leaving loading active", async () => {
    setBrowserUrl("/?error=access_denied&error_description=Expired%20link");
    await expect(completeAuthCallback(authMocks)).rejects.toThrow(
      "登录链接处理失败：Expired link",
    );
  });

  it("rejects incomplete callback payloads instead of loading forever", async () => {
    setBrowserUrl("/#error=access_denied");
    await expect(completeAuthCallback(authMocks)).rejects.toThrow(
      "登录回调缺少有效会话信息",
    );
  });

  it("rejects authentication requests at the UI deadline", async () => {
    vi.useFakeTimers();
    const request = new Promise<never>(() => undefined);
    const expectation = expect(withAuthTimeout(request)).rejects.toBeInstanceOf(
      AuthTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(12_000);
    await expectation;
    vi.useRealTimers();
  });

  it("always resolves the session gate to a concrete state or route", () => {
    const session = { user: { id: "user-1" } } as Session;
    expect(getSessionDestination(null, "/")).toBe("/login");
    expect(getSessionDestination(null, "/login")).toBe("");
    expect(getSessionDestination(session, "/login")).toBe("/");
    expect(getSessionDestination(session, "/inventory")).toBe("");
  });
});
