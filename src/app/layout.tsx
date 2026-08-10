import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/layout/BottomNav";
import DataSourceGate from "@/components/ui/DataSourceGate";

export const metadata: Metadata = {
  title: "进销存",
  description: "个人商品进销存与利润管理",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "进销存",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F2F2F7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh">
        {/* 内容区：移动端单列，底部预留导航高度 */}
        <DataSourceGate>
          <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6">{children}</main>
          <BottomNav />
        </DataSourceGate>
      </body>
    </html>
  );
}
