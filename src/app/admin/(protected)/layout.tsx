import Link from "next/link";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { adminLogoutAction } from "@/lib/actions/adminAuth";
import { prisma } from "@/lib/prisma";
import { REFUND_STATUS, EXCHANGE_STATUS, INQUIRY_STATUS, TOPUP_STATUS } from "@/lib/constants";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/products", label: "상품(등급) 관리" },
  { href: "/admin/inventory", label: "계정 재고 관리" },
  { href: "/admin/orders", label: "주문 관리" },
  { href: "/admin/members", label: "회원 관리" },
  { href: "/admin/payments", label: "결제(충전) 관리" },
  { href: "/admin/refunds", label: "환불 관리" },
  { href: "/admin/exchanges", label: "교환 관리" },
  { href: "/admin/coupons", label: "쿠폰 관리" },
  { href: "/admin/points", label: "포인트 관리" },
  { href: "/admin/reviews", label: "리뷰 관리" },
  { href: "/admin/inquiries", label: "문의 관리" },
  { href: "/admin/reports", label: "신고 관리" },
  { href: "/admin/notifications", label: "알림 발송" },
  { href: "/admin/stats", label: "통계" },
  { href: "/admin/settings", label: "관리자 설정" },
  { href: "/admin/security/admins", label: "관리자 보안" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  const [pendingTopUps, pendingRefunds, pendingExchanges, waitingInquiries] = await Promise.all([
    prisma.pointTopUpRequest.count({ where: { status: TOPUP_STATUS.PENDING } }),
    prisma.refundRequest.count({ where: { status: REFUND_STATUS.PENDING } }),
    prisma.exchangeRequest.count({ where: { status: EXCHANGE_STATUS.PENDING } }),
    prisma.inquiry.count({ where: { status: INQUIRY_STATUS.WAITING } }),
  ]);

  const badges: Record<string, number> = {
    "/admin/payments": pendingTopUps,
    "/admin/refunds": pendingRefunds,
    "/admin/exchanges": pendingExchanges,
    "/admin/inquiries": waitingInquiries,
  };

  return (
    <div className="min-h-screen flex bg-neutral-100">
      <aside className="w-56 shrink-0 bg-neutral-900 text-neutral-300 min-h-screen p-4">
        <Link href="/admin" className="block text-white font-bold text-lg mb-6">
          🎨 자비샵 Admin
        </Link>
        <nav className="space-y-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-neutral-800 hover:text-white"
            >
              <span>{item.label}</span>
              {badges[item.href] > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5">
                  {badges[item.href]}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="h-14 bg-white border-b border-neutral-200 flex items-center justify-end gap-4 px-6 text-sm">
          <span className="text-neutral-500">
            {admin.name} ({admin.role})
          </span>
          <form action={adminLogoutAction}>
            <button className="text-neutral-400 hover:text-neutral-700">로그아웃</button>
          </form>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
