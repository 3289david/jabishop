import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS, REFUND_STATUS, EXCHANGE_STATUS, INQUIRY_STATUS, ARTWORK_STATUS } from "@/lib/constants";

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function AdminDashboardPage() {
  const todayStart = startOfToday();

  const [
    todayOrders,
    stockCount,
    memberCount,
    pendingRefunds,
    pendingExchanges,
    waitingInquiries,
    recentOrders,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: todayStart }, status: { not: ORDER_STATUS.CANCELLED } },
    }),
    prisma.artwork.count({ where: { status: ARTWORK_STATUS.AVAILABLE } }),
    prisma.user.count(),
    prisma.refundRequest.count({ where: { status: REFUND_STATUS.PENDING } }),
    prisma.exchangeRequest.count({ where: { status: EXCHANGE_STATUS.PENDING } }),
    prisma.inquiry.count({ where: { status: INQUIRY_STATUS.WAITING } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { tier: true, user: true },
    }),
  ]);

  const todayRevenue = todayOrders
    .filter((o) => o.status === ORDER_STATUS.COMPLETED)
    .reduce((sum, o) => sum + o.finalAmount, 0);

  const cards = [
    { label: "오늘 매출", value: `₩${todayRevenue.toLocaleString()}` },
    { label: "오늘 주문", value: `${todayOrders.length}건` },
    { label: "현재 계정 재고", value: `${stockCount}개` },
    { label: "회원 수", value: `${memberCount.toLocaleString()}명` },
    { label: "환불 요청", value: `${pendingRefunds}건`, href: "/admin/refunds" },
    { label: "교환 요청", value: `${pendingExchanges}건`, href: "/admin/exchanges" },
    { label: "문의", value: `${waitingInquiries}건`, href: "/admin/inquiries" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">관리자 대시보드</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => {
          const inner = (
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <div className="text-sm text-neutral-500">{c.label}</div>
              <div className="text-2xl font-bold mt-1">{c.value}</div>
            </div>
          );
          return c.href ? (
            <Link key={c.label} href={c.href}>
              {inner}
            </Link>
          ) : (
            <div key={c.label}>{inner}</div>
          );
        })}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 font-semibold text-sm">최근 주문</div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">주문번호</th>
              <th className="text-left px-4 py-2">회원</th>
              <th className="text-left px-4 py-2">상품</th>
              <th className="text-left px-4 py-2">금액</th>
              <th className="text-left px-4 py-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/admin/orders/${o.id}`} className="text-indigo-600 hover:underline">
                    #{o.orderNo}
                  </Link>
                </td>
                <td className="px-4 py-2">{o.user?.name ?? "-"}</td>
                <td className="px-4 py-2">{o.tier.name}</td>
                <td className="px-4 py-2">{o.finalAmount.toLocaleString()}P</td>
                <td className="px-4 py-2">{o.status}</td>
              </tr>
            ))}
            {recentOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-neutral-400 py-6">
                  주문 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
