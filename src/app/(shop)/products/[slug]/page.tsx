import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ARTWORK_STATUS, REVIEW_STATUS } from "@/lib/constants";
import { PurchaseForm } from "@/components/PurchaseForm";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tier = await prisma.tier.findUnique({ where: { slug } });
  if (!tier) notFound();

  const user = await getCurrentUser();

  const [stock, categories, reviews] = await Promise.all([
    prisma.artwork.count({ where: { tierId: tier.id, status: ARTWORK_STATUS.AVAILABLE } }),
    prisma.artwork.groupBy({
      by: ["category"],
      where: { tierId: tier.id, status: ARTWORK_STATUS.AVAILABLE },
      _count: true,
    }),
    prisma.review.findMany({
      where: { order: { tierId: tier.id }, status: REVIEW_STATUS.VISIBLE },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="grid md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{tier.name}</h1>
          <p className="text-neutral-500 mt-1">{tier.description}</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-neutral-400">가격</div>
            <div className="font-bold text-lg">{tier.price.toLocaleString()}P</div>
          </div>
          <div>
            <div className="text-neutral-400">그림 범위</div>
            <div className="font-semibold">
              {tier.minCount}~{tier.maxCount}개 중 1개
            </div>
          </div>
          <div>
            <div className="text-neutral-400">현재 재고</div>
            <div className="font-semibold">{stock}개</div>
          </div>
          <div>
            <div className="text-neutral-400">구매 제한</div>
            <div className="font-semibold">
              {tier.purchaseLimitPerUser ? `1인 ${tier.purchaseLimitPerUser}개` : "제한 없음"}
            </div>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-2">포함 가능 카테고리</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              {categories.map((c) => (
                <span key={c.category} className="bg-neutral-100 rounded-full px-3 py-1">
                  {c.category} ({c._count})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-3">구매자 리뷰 ({reviews.length})</h3>
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="border-b border-neutral-100 pb-3 last:border-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.user.name}</span>
                  <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                  {r.purchaseVerified && (
                    <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">구매확인</span>
                  )}
                </div>
                <p className="text-sm text-neutral-600 mt-1">{r.content}</p>
              </div>
            ))}
            {reviews.length === 0 && <p className="text-sm text-neutral-400">아직 리뷰가 없습니다.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5 h-fit sticky top-20">
        {user ? (
          stock > 0 ? (
            <>
              <p className="text-sm text-neutral-500 mb-3">보유 포인트: {user.points.toLocaleString()}P</p>
              <PurchaseForm tierId={tier.id} price={tier.price} />
            </>
          ) : (
            <p className="text-center text-neutral-400 py-6">현재 품절된 상품입니다.</p>
          )
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-neutral-500 mb-3">구매하려면 로그인이 필요합니다.</p>
            <Link
              href="/login"
              className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
            >
              로그인하러 가기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
