import { prisma } from "@/lib/prisma";
import { ORDER_STATUS } from "@/lib/constants";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function AdminStatsPage() {
  const since = daysAgo(13);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since }, status: ORDER_STATUS.COMPLETED },
    include: { tier: true },
  });

  const byDay = new Map<string, { count: number; revenue: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i);
    byDay.set(d.toLocaleDateString("ko-KR"), { count: 0, revenue: 0 });
  }
  for (const o of orders) {
    const key = o.createdAt.toLocaleDateString("ko-KR");
    const cur = byDay.get(key);
    if (cur) {
      cur.count += 1;
      cur.revenue += o.finalAmount;
    }
  }

  const byTier = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    const cur = byTier.get(o.tier.name) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += o.finalAmount;
    byTier.set(o.tier.name, cur);
  }

  const maxRevenue = Math.max(1, ...[...byDay.values()].map((v) => v.revenue));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">통계</h1>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4">최근 14일 매출</h2>
        <div className="flex items-end gap-2 h-40">
          {[...byDay.entries()].map(([date, v]) => (
            <div key={date} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-indigo-500 rounded-t"
                style={{ height: `${Math.max(4, (v.revenue / maxRevenue) * 140)}px` }}
                title={`${date}: ${v.revenue.toLocaleString()}원`}
              />
              <span className="text-[10px] text-neutral-400 rotate-0">{date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 font-semibold text-sm">등급별 판매 현황 (최근 14일)</div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">등급</th>
              <th className="text-left px-4 py-2">판매건수</th>
              <th className="text-left px-4 py-2">매출</th>
            </tr>
          </thead>
          <tbody>
            {[...byTier.entries()].map(([name, v]) => (
              <tr key={name} className="border-t border-neutral-100">
                <td className="px-4 py-2">{name}</td>
                <td className="px-4 py-2">{v.count}건</td>
                <td className="px-4 py-2">{v.revenue.toLocaleString()}원</td>
              </tr>
            ))}
            {byTier.size === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-neutral-400 py-10">
                  최근 14일간 판매 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
