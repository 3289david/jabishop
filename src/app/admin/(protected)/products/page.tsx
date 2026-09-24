import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteTierAction, duplicateAllTiersAction } from "@/lib/actions/adminProducts";
import { ARTWORK_STATUS } from "@/lib/constants";
import { DuplicateTiersButton } from "@/components/admin/DuplicateTiersButton";
import { BulkDeleteStockButton } from "@/components/admin/BulkDeleteStockButton";

const UNCATEGORIZED_LABEL = "기타";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = await searchParams;
  const allTiers = await prisma.tier.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { artworks: { where: { status: ARTWORK_STATUS.AVAILABLE } } } } },
  });

  const categories = Array.from(new Set(allTiers.map((t) => t.category || UNCATEGORIZED_LABEL))).sort();
  const activeCategory = sp.category;
  const tiers = activeCategory
    ? allTiers.filter((t) => (t.category || UNCATEGORIZED_LABEL) === activeCategory)
    : allTiers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">상품(등급) 관리</h1>
        <div className="flex gap-2">
          <DuplicateTiersButton action={duplicateAllTiersAction} />
          <Link href="/admin/products/new" className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-md hover:bg-indigo-700">
            등급 추가
          </Link>
        </div>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/products"
            className={`text-xs px-3 py-1.5 rounded-full border ${
              !activeCategory ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            전체
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={`/admin/products?category=${encodeURIComponent(c)}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                activeCategory === c ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">등급명</th>
              <th className="text-left px-4 py-2">카테고리</th>
              <th className="text-left px-4 py-2">가격</th>
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
                <td className="px-4 py-2 text-neutral-500">{t.category || UNCATEGORIZED_LABEL}</td>
                <td className="px-4 py-2">{t.price.toLocaleString()}원</td>
                <td className="px-4 py-2">{t._count.artworks}개</td>
                <td className="px-4 py-2">{t.purchaseLimitPerUser ?? "-"}</td>
                <td className="px-4 py-2">{t.status}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/inventory?tierId=${t.id}`} className="text-xs text-indigo-600 hover:underline">
                      재고 추가
                    </Link>
                    <BulkDeleteStockButton tierId={t.id} tierName={t.name} />
                    <form action={deleteTierAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-neutral-400 hover:text-red-500">삭제</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {tiers.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-neutral-400 py-10">
                  조건에 맞는 등급이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
