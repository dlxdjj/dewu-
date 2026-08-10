import type { MetadataRoute } from "next";
import { withBasePath } from "@/lib/base-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "进销存与利润管理",
    short_name: "进销存",
    description: "个人商品进销存与利润管理",
    start_url: withBasePath("/"),
    scope: withBasePath("/"),
    display: "standalone",
    background_color: "#F2F2F7",
    theme_color: "#F2F2F7",
    icons: [
      {
        src: withBasePath("/icons/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: withBasePath("/icons/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
