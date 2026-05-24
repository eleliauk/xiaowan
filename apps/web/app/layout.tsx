import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "美团短时活动 Agent",
  description: "本地短时活动规划与执行 Agent MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
