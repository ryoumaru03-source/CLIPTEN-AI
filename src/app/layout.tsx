import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-sans-jp",
  subsets: ["latin", "latin-ext", "japanese"],
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
      <body
        className={`${notoSansJp.variable} antialiased bg-slate-950 text-slate-50`}
      >
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1d2538,_#020617)]">
          {children}
        </div>
      </body>
    </html>
  );
}
