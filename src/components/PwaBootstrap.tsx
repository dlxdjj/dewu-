"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";
import { recordClientEvent } from "@/lib/monitoring";

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
    const onError = (event: ErrorEvent) =>
      recordClientEvent("error", event.error ?? event.message);
    const onUnhandled = (event: PromiseRejectionEvent) =>
      recordClientEvent("error", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);
  return null;
}
