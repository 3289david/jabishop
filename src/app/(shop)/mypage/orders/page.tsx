import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { tier: true, artwork: true },
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 font-semibold text-sm">주문 내역</div>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-500">
          <tr>
            <th className="text-left px-4 py-2">주문번호</th>
            <th className="text-left px-4 py-2">상품</th>
            <th className="text-left px-4 py-2">지급된 계정</th>
            <th className="text-left px-4 py-2">결제금액</th>
            <th className="text-left px-4 py-2">상태</th>
            <th className="text-left px-4 py-2">주문일</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-neutral-100">
              <td className="px-4 py-2">
                <Link href={`/mypage/orders/${o.id}`} className="text-indigo-600 hover:underline">
                  #{o.orderNo}
                </Link>
              </td>
              <td className="px-4 py-2">{o.tier.name}</td>
              <td className="px-4 py-2">{o.artwork?.title ?? "-"}</td>
              <td className="px-4 py-2">{o.finalAmount.toLocaleString()}P</td>
              <td className="px-4 py-2">{o.status}</td>
              <td className="px-4 py-2 text-neutral-400">{o.createdAt.toLocaleDateString("ko-KR")}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-neutral-400 py-10">
                주문 내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
