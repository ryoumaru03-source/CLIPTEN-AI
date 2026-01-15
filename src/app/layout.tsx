import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-sans-jp",
  // Noto_Sans_JP は Next.js の型的には latin のみが有効なサブセット
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clipten AI – 自動切り抜き動画エディタ",
  description: "長時間の動画から、AIが見どころを自動で切り抜いてくれる動画編集アプリ。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJp.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
