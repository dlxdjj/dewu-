export function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";

  if (!trimmed || trimmed === "/") return "";

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export const appBasePath = normalizeBasePath(
  process.env.NEXT_PUBLIC_BASE_PATH,
);

export function withBasePath(
  path: string,
  basePath = appBasePath,
): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!normalizedBasePath) return normalizedPath;
  if (normalizedPath === "/") return `${normalizedBasePath}/`;

  return `${normalizedBasePath}${normalizedPath}`;
}
