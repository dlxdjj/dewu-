import type { NextConfig } from "next";
import { normalizeBasePath } from "./src/lib/base-path";

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
};

export default nextConfig;
