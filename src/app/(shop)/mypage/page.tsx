import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function MyPageHome() {
  const user = await getCurrentUser();
  if (!user) return null;

  const recentOrders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { tier: true },
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <p className="text-neutral-500 text-sm">{user.email}</p>
        <h1 className="text-xl font-bold mt-1">{user.name}님, 안녕하세요.</h1>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-indigo-600">{user.points.toLocaleString()}P</span>
          <Link href="/mypage/points" className="text-sm text-indigo-600 hover:underline">
            충전하기
          </Link>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">최근 주문</h2>
          <Link href="/mypage/orders" className="text-sm text-indigo-600 hover:underline">
            전체보기
          </Link>
        </div>
        <div className="divide-y divide-neutral-100">
          {recentOrders.map((o) => (
            <Link
              key={o.id}
              href={`/mypage/orders/${o.id}`}
              className="flex items-center justify-between py-2 text-sm hover:text-indigo-600"
            >
              <span>
                #{o.orderNo} · {o.tier.name}
              </span>
              <span className="text-neutral-400">{o.status}</span>
            </Link>
          ))}
          {recentOrders.length === 0 && (
            <p className="text-sm text-neutral-400 py-4">아직 주문 내역이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
