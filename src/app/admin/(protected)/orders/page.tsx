import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.status) where.status = sp.status;
  if (sp.q) {
    where.OR = [
      { orderNo: { contains: sp.q } },
      { user: { email: { contains: sp.q } } },
      { user: { name: { contains: sp.q } } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    include: { user: true, tier: true, artwork: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">주문 관리</h1>

      <form className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap gap-3 items-end text-sm">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">상태</label>
          <select name="status" defaultValue={sp.status} className="border rounded-md px-2 py-1.5">
            <option value="">전체</option>
            <option value="PENDING_PAYMENT">결제대기</option>
            <option value="RESERVED">재고예약</option>
            <option value="COMPLETED">완료</option>
            <option value="CANCELLED">취소</option>
            <option value="EXPIRED">만료</option>
            <option value="REFUNDED">환불완료</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">검색 (주문번호/이메일/이름)</label>
          <input name="q" defaultValue={sp.q} className="border rounded-md px-2 py-1.5" />
        </div>
        <button className="bg-neutral-900 text-white px-3 py-1.5 rounded-md">검색</button>
      </form>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">주문번호</th>
              <th className="text-left px-4 py-2">회원</th>
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
                  <Link href={`/admin/orders/${o.id}`} className="text-indigo-600 hover:underline">
                    #{o.orderNo}
                  </Link>
                </td>
                <td className="px-4 py-2">{o.user?.name} ({o.user?.email})</td>
                <td className="px-4 py-2">{o.tier.name}</td>
                <td className="px-4 py-2">{o.artwork?.title ?? "-"}</td>
                <td className="px-4 py-2">{o.finalAmount.toLocaleString()}P</td>
                <td className="px-4 py-2">{o.status}</td>
                <td className="px-4 py-2 text-neutral-400">{o.createdAt.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-neutral-400 py-10">
                  주문이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
