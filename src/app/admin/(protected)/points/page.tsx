import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminPointsPage() {
  const txs = await prisma.pointTransaction.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">포인트 관리</h1>
        <Link href="/admin/payments" className="text-sm text-indigo-600 hover:underline">
          충전 승인/거절 하러가기 →
        </Link>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">회원</th>
              <th className="text-left px-4 py-2">유형</th>
              <th className="text-left px-4 py-2">금액</th>
              <th className="text-left px-4 py-2">잔액</th>
              <th className="text-left px-4 py-2">메모</th>
              <th className="text-left px-4 py-2">일시</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{t.user.name}</td>
                <td className="px-4 py-2">{t.type}</td>
                <td className={`px-4 py-2 ${t.amount >= 0 ? "text-green-600" : "text-neutral-700"}`}>
                  {t.amount >= 0 ? "+" : ""}
                  {t.amount.toLocaleString()}P
                </td>
                <td className="px-4 py-2">{t.balanceAfter.toLocaleString()}P</td>
                <td className="px-4 py-2 text-neutral-500">{t.memo}</td>
                <td className="px-4 py-2 text-neutral-400">{t.createdAt.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
            {txs.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-neutral-400 py-10">
                  포인트 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
