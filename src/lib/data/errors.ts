export const DATA_REQUEST_TIMEOUT_MS = 15_000;

export class ConfigurationError extends Error {
  constructor(message = "Supabase 未配置，请先配置项目 URL 与 publishable/anon key。") {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class AuthenticationError extends Error {
  constructor(message = "登录已失效，请重新登录。") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class DataAccessError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "DataAccessError";
    this.retryable = retryable;
  }
}

export class DataTimeoutError extends DataAccessError {
  constructor() {
    super("读取数据库超时，请检查网络后重试。", true);
    this.name = "DataTimeoutError";
  }
}

/** Reject database requests that exceed the UI deadline. */
export function withDataTimeout<T>(request: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new DataTimeoutError()),
      DATA_REQUEST_TIMEOUT_MS,
    );
    Promise.resolve(request).then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function readableDataError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new DataAccessError("数据操作失败，请联网后重试。", true);
}
