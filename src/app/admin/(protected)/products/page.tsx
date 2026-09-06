import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteTierAction } from "@/lib/actions/adminProducts";
import { ARTWORK_STATUS } from "@/lib/constants";

export default async function AdminProductsPage() {
  const tiers = await prisma.tier.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { artworks: { where: { status: ARTWORK_STATUS.AVAILABLE } } } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">상품(등급) 관리</h1>
        <Link href="/admin/products/new" className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-md hover:bg-indigo-700">
          등급 추가
        </Link>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">등급명</th>
              <th className="text-left px-4 py-2">가격</th>
              <th className="text-left px-4 py-2">그림 수 범위</th>
              <th className="text-left px-4 py-2">재고</th>
              <th className="text-left px-4 py-2">구매제한</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/admin/products/${t.id}/edit`} className="text-indigo-600 hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{t.price.toLocaleString()}원</td>
                <td className="px-4 py-2">{t.minCount}~{t.maxCount}개</td>
                <td className="px-4 py-2">{t._count.artworks}개</td>
                <td className="px-4 py-2">{t.purchaseLimitPerUser ?? "-"}</td>
                <td className="px-4 py-2">{t.status}</td>
                <td className="px-4 py-2 text-right">
                  <form action={deleteTierAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs text-neutral-400 hover:text-red-500">삭제</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
