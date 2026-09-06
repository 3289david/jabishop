import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const where = sp.q
    ? { OR: [{ email: { contains: sp.q } }, { name: { contains: sp.q } }] }
    : {};

  const members = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">회원 관리</h1>
      <form className="bg-white border border-neutral-200 rounded-xl p-4 flex gap-3 items-end text-sm">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">검색 (이메일/이름)</label>
          <input name="q" defaultValue={sp.q} className="border rounded-md px-2 py-1.5" />
        </div>
        <button className="bg-neutral-900 text-white px-3 py-1.5 rounded-md">검색</button>
      </form>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">이름</th>
              <th className="text-left px-4 py-2">이메일</th>
              <th className="text-left px-4 py-2">포인트</th>
              <th className="text-left px-4 py-2">주문수</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">가입일</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/admin/members/${m.id}`} className="text-indigo-600 hover:underline">
                    {m.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{m.email}</td>
                <td className="px-4 py-2">{m.points.toLocaleString()}P</td>
                <td className="px-4 py-2">{m._count.orders}</td>
                <td className="px-4 py-2">{m.status}</td>
                <td className="px-4 py-2 text-neutral-400">{m.createdAt.toLocaleDateString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
