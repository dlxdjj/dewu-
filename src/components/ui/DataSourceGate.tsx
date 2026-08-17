"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  completeAuthCallback,
  getCanonicalLocalUrl,
  getSession,
  onAuthSessionChange,
} from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { toAppPathname } from "@/lib/base-path";

export interface GateDependencies {
  completeAuthCallback: () => Promise<Session | null>;
  getCanonicalLocalUrl: () => string;
  getSession: () => Promise<Session | null>;
  isSupabaseConfigured: boolean;
  onAuthSessionChange: (
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ) => () => void;
}

const defaultDependencies: GateDependencies = {
  completeAuthCallback,
  getCanonicalLocalUrl,
  getSession,
  isSupabaseConfigured,
  onAuthSessionChange,
};

export interface GateNavigation {
  pathname: string;
  replace: (href: string) => void;
}

function useDefaultNavigation(): GateNavigation {
  const pathname = toAppPathname(usePathname());
  const router = useRouter();
  return { pathname, replace: router.replace };
}

export type GateState =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "unconfigured"
  | "error";

/** Gate the application using the active Next.js navigation context. */
export default function DataSourceGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigation = useDefaultNavigation();
  if (process.env.NODE_ENV === "development" && navigation.pathname === "/theme-qa") {
    return children;
  }
  return (
    <DataSourceGateController navigation={navigation}>
      {children}
    </DataSourceGateController>
  );
}

/** Testable gate state machine with explicit infrastructure dependencies. */
export function DataSourceGateController({
  children,
  dependencies = defaultDependencies,
  navigation,
}: {
  children: React.ReactNode;
  dependencies?: GateDependencies;
  navigation: GateNavigation;
}) {
  const pathname = navigation.pathname;
  const replace = navigation.replace;
  const pathnameRef = useRef(pathname);
  const replaceRef = useRef(replace);
  useEffect(() => {
    pathnameRef.current = pathname;
    replaceRef.current = replace;
  }, [pathname, replace]);
  const [state, setState] = useState<GateState>("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setMessage("");
    setState("loading");
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    if (!dependencies.isSupabaseConfigured) {
      queueMicrotask(() => {
        if (active) setState("unconfigured");
      });
      return () => {
        active = false;
      };
    }

    const canonicalLocalUrl = dependencies.getCanonicalLocalUrl();
    if (canonicalLocalUrl) {
      window.location.replace(canonicalLocalUrl);
      return () => {
        active = false;
      };
    }

    async function initialize(): Promise<void> {
      try {
        const callbackSession = await dependencies.completeAuthCallback();
        const session = callbackSession ?? (await dependencies.getSession());
        if (!active) return;

        if (session) {
          setState("authenticated");
          if (pathnameRef.current === "/login") replaceRef.current("/");
        } else {
          setState("unauthenticated");
          if (pathnameRef.current !== "/login") replaceRef.current("/login");
        }

        unsubscribe = dependencies.onAuthSessionChange((_event, changedSession) => {
          if (!active) return;
          if (changedSession) {
            setState("authenticated");
            if (pathnameRef.current === "/login") replaceRef.current("/");
          } else {
            setState("unauthenticated");
            if (pathnameRef.current !== "/login") replaceRef.current("/login");
          }
        });
      } catch (error: unknown) {
        if (!active) return;
        const detail =
          error instanceof Error ? error.message : "连接 Supabase Auth 失败";
        setMessage(
          `${detail} 请重试；若链接已过期或 origin 不一致，请返回登录页重新登录。`,
        );
        setState("error");
      }
    }

    void initialize();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt, dependencies]);

  if (state === "loading") {
    return <GateCard title="正在连接 Supabase" detail="正在确认登录状态…" />;
  }
  if (state === "unconfigured") {
    return (
      <GateCard
        title="Supabase 未配置"
        detail="正式运行不提供本地数据库回退。请根据 .env.example 配置 URL、publishable/anon key 并重启。"
      />
    );
  }
  if (state === "error") {
    return (
      <GateCard
        title="登录或数据源连接失败"
        detail={message || "请检查网络后重试。"}
        onRetry={retry}
        onLogin={() => replace("/login")}
      />
    );
  }
  if (state === "unauthenticated" && pathname !== "/login") {
    return (
      <GateCard
        title="需要登录"
        detail="当前没有有效会话，正在前往登录页。"
        onLogin={() => replace("/login")}
      />
    );
  }
  return children;
}

function GateCard({
  title,
  detail,
  onRetry,
  onLogin,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
  onLogin?: () => void;
}) {
  return (
    <div className="mx-auto mt-20 max-w-sm rounded-[28px] border border-separator bg-card p-6 text-center shadow-[var(--cirrus-shadow-2)]">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
      {(onRetry || onLogin) && (
        <div className="mt-5 flex gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 rounded-xl bg-tint px-4 py-3 text-sm font-medium text-white"
            >
              重试
            </button>
          )}
          {onLogin && (
            <button
              type="button"
              onClick={onLogin}
              className="flex-1 rounded-xl bg-background px-4 py-3 text-sm font-medium"
            >
              返回登录
            </button>
          )}
        </div>
      )}
    </div>
  );
}
