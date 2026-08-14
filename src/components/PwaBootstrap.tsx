"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";

export default function PwaBootstrap() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register(withBasePath("/sw.js"), {
        scope: withBasePath("/"),
      });
    }
    if (navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => false);
    }
  }, []);
  return null;
}
