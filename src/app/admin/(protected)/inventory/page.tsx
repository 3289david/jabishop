import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteArtworkAction } from "@/lib/actions/adminInventory";
import { CsvImportForm } from "@/components/admin/CsvImportForm";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tierId?: string; category?: string; status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const tiers = await prisma.tier.findMany({ orderBy: { sortOrder: "asc" } });

  const where: Record<string, unknown> = {};
  if (sp.tierId) where.tierId = sp.tierId;
  if (sp.category) where.category = sp.category;
  if (sp.status) where.status = sp.status;
  if (sp.q) where.OR = [{ title: { contains: sp.q } }, { code: { contains: sp.q } }];

  const artworks = await prisma.artwork.findMany({
    where,
    include: { tier: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const categories = await prisma.artwork.findMany({ distinct: ["category"], select: { category: true } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">그림 재고 관리</h1>
        <div className="flex gap-2">
          <a
            href="/api/admin/inventory/export"
            className="border border-neutral-300 text-sm px-3 py-2 rounded-md hover:bg-neutral-50"
          >
            CSV 내보내기
          </a>
          <Link href="/admin/inventory/new" className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-md hover:bg-indigo-700">
            그림 추가
          </Link>
        </div>
      </div>

      <CsvImportForm />

      <form className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap gap-3 items-end text-sm">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">등급</label>
          <select name="tierId" defaultValue={sp.tierId} className="border rounded-md px-2 py-1.5">
            <option value="">전체</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">카테고리</label>
          <select name="category" defaultValue={sp.category} className="border rounded-md px-2 py-1.5">
            <option value="">전체</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">상태</label>
          <select name="status" defaultValue={sp.status} className="border rounded-md px-2 py-1.5">
            <option value="">전체</option>
            <option value="AVAILABLE">판매가능</option>
            <option value="RESERVED">예약됨</option>
            <option value="SOLD">판매됨</option>
            <option value="HIDDEN">숨김</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">검색</label>
          <input name="q" defaultValue={sp.q} placeholder="코드/제목" className="border rounded-md px-2 py-1.5" />
        </div>
        <button className="bg-neutral-900 text-white px-3 py-1.5 rounded-md">필터 적용</button>
      </form>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">코드</th>
              <th className="text-left px-4 py-2">등급</th>
              <th className="text-left px-4 py-2">제목</th>
              <th className="text-left px-4 py-2">카테고리</th>
              <th className="text-left px-4 py-2">희귀도</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {artworks.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono text-xs">{a.code}</td>
                <td className="px-4 py-2">{a.tier.name}</td>
                <td className="px-4 py-2">
                  <Link href={`/admin/inventory/${a.id}/edit`} className="text-indigo-600 hover:underline">
                    {a.title}
                  </Link>
                </td>
                <td className="px-4 py-2">{a.category}</td>
                <td className="px-4 py-2">{"★".repeat(a.rarityStars)}</td>
                <td className="px-4 py-2">{a.status}</td>
                <td className="px-4 py-2 text-right">
                  <form action={deleteArtworkAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="text-xs text-neutral-400 hover:text-red-500">삭제</button>
                  </form>
                </td>
              </tr>
            ))}
            {artworks.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-neutral-400 py-10">
                  조건에 맞는 재고가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
