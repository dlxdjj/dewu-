import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataSourceGateController } from "./DataSourceGate";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  replace: vi.fn(),
  completeAuthCallback: vi.fn(),
  getCanonicalLocalUrl: vi.fn(),
  getSession: vi.fn(),
  onAuthSessionChange: vi.fn(),
}));

const dependencies = {
  completeAuthCallback: mocks.completeAuthCallback,
  getCanonicalLocalUrl: mocks.getCanonicalLocalUrl,
  getSession: mocks.getSession,
  isSupabaseConfigured: true,
  onAuthSessionChange: mocks.onAuthSessionChange,
};
const navigation = {
  get pathname(): string {
    return mocks.pathname;
  },
  replace: mocks.replace,
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("DataSourceGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/";
    mocks.getCanonicalLocalUrl.mockReturnValue("");
    mocks.completeAuthCallback.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue(null);
    mocks.onAuthSessionChange.mockReturnValue(vi.fn());
  });

  it("settles from loading to unauthenticated and routes to login", async () => {
    const sessionRequest = deferred<null>();
    mocks.getSession.mockReturnValue(sessionRequest.promise);
    render(
      <DataSourceGateController
        dependencies={dependencies}
        navigation={navigation}
      >
        <div>受保护内容</div>
      </DataSourceGateController>,
    );

    expect(screen.getByText("正在连接 Supabase")).toBeInTheDocument();
    sessionRequest.resolve(null);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByText("需要登录")).toBeInTheDocument();
  });

  it("settles from loading to authenticated content", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    render(
      <DataSourceGateController
        dependencies={dependencies}
        navigation={navigation}
      >
        <div>首页内容</div>
      </DataSourceGateController>,
    );

    expect(await screen.findByText("首页内容")).toBeInTheDocument();
    expect(mocks.onAuthSessionChange).toHaveBeenCalled();
  });

  it("shows login for an unauthenticated session without an infinite spinner", async () => {
    mocks.pathname = "/login";
    render(
      <DataSourceGateController
        dependencies={dependencies}
        navigation={navigation}
      >
        <div>登录表单</div>
      </DataSourceGateController>,
    );

    expect(await screen.findByText("登录表单")).toBeInTheDocument();
    expect(screen.queryByText("正在连接 Supabase")).not.toBeInTheDocument();
  });

  it("exits loading and offers recovery when session loading fails", async () => {
    mocks.getSession.mockRejectedValue(new Error("登录状态检查超时"));
    render(
      <DataSourceGateController
        dependencies={dependencies}
        navigation={navigation}
      >
        <div>首页内容</div>
      </DataSourceGateController>,
    );

    expect(
      await screen.findByText("登录或数据源连接失败"),
    ).toBeInTheDocument();
    expect(screen.getByText(/登录状态检查超时/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.queryByText("正在连接 Supabase")).not.toBeInTheDocument();
  });

  it("exits loading and offers recovery when callback processing fails", async () => {
    mocks.completeAuthCallback.mockRejectedValue(new Error("PKCE code 已失效"));
    render(
      <DataSourceGateController
        dependencies={dependencies}
        navigation={navigation}
      >
        <div>首页内容</div>
      </DataSourceGateController>,
    );

    expect(
      await screen.findByText("登录或数据源连接失败"),
    ).toBeInTheDocument();
    expect(screen.getByText(/PKCE code 已失效/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "返回登录" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("正在连接 Supabase")).not.toBeInTheDocument();
  });
});
