import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { prisma } from "@/lib/prisma";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const shopName = settings?.shopName || "자비샵";
  return { title: `${shopName} 관리자`, description: `${shopName} 관리자 패널입니다.` };
}

// 관리자 영역은 쇼핑몰 방문자용 헤더/푸터와 완전히 분리된 별도의 루트 레이아웃을 사용한다.
// (Next.js의 "multiple root layouts" 패턴 - 그룹별로 최상위 <html>/<body>를 따로 둔다)
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-100 text-neutral-900">{children}</body>
    </html>
  );
}
