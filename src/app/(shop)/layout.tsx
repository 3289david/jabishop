import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { Nav } from "@/components/Nav";
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
  return {
    title: `${shopName} | 랜덤 계정 판매`,
    description: `등급별 랜덤 계정 상품을 판매하는 ${shopName}입니다.`,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const shopName = settings?.shopName || "자비샵";

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <Nav />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">{children}</main>
        <footer className="border-t border-neutral-200 py-6 text-center text-sm text-neutral-500">
          © {new Date().getFullYear()} {shopName}. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
