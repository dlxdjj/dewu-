import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/layout/BottomNav";
import DataSourceGate from "@/components/ui/DataSourceGate";
import PwaBootstrap from "@/components/PwaBootstrap";
import AppDataProvider from "@/components/AppDataProvider";

export const metadata: Metadata = {
  title: "进销存",
  description: "个人商品进销存与利润管理",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "进销存",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#B8D4F1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh">
        <DataSourceGate>
          <PwaBootstrap />
          <AppDataProvider>
            <main className="app-main mx-auto w-full max-w-3xl px-4 pb-36 pt-[calc(1.5rem+env(safe-area-inset-top))]">{children}</main>
            <BottomNav />
          </AppDataProvider>
        </DataSourceGate>
      </body>
    </html>
  );
}
