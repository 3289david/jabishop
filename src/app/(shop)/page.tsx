import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TIER_STATUS, ARTWORK_STATUS, ORDER_STATUS } from "@/lib/constants";

export default async function HomePage() {
  const [tiers, memberCount, buyerCount] = await Promise.all([
    prisma.tier.findMany({
      where: { status: { not: TIER_STATUS.HIDDEN } },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { artworks: { where: { status: ARTWORK_STATUS.AVAILABLE } } } } },
    }),
    prisma.user.count(),
    prisma.order
      .findMany({
        where: { status: ORDER_STATUS.COMPLETED },
        distinct: ["userId"],
        select: { userId: true },
      })
      .then((rows) => rows.length),
  ]);

  return (
    <div>
      <section className="text-center py-10">
        <h1 className="text-3xl font-bold mb-2">🎨 자비샵</h1>
        <p className="text-neutral-500">
          등급을 선택해 구매하면, 해당 등급의 그림 중 하나가 무작위로 지급됩니다.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <span className="inline-flex items-center gap-1.5 bg-[#2b2d31] text-[#949ba4] font-mono text-sm px-3 py-1.5 rounded-md">
            🔊<span className="text-neutral-300">ㅣ</span>회원수: {memberCount.toLocaleString()}명
          </span>
          <span className="inline-flex items-center gap-1.5 bg-[#2b2d31] text-[#949ba4] font-mono text-sm px-3 py-1.5 rounded-md">
            🔊<span className="text-neutral-300">ㅣ</span>구매자수: {buyerCount.toLocaleString()}명
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const stock = tier._count.artworks;
          const soldOut = stock === 0 || tier.status === TIER_STATUS.SOLD_OUT;
          return (
            <Link
              key={tier.id}
              href={`/products/${tier.slug}`}
              className="border border-neutral-200 rounded-xl p-5 bg-white hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">{tier.name}</h2>
                {soldOut && (
                  <span className="text-xs bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">
                    품절
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-500 mb-3 line-clamp-2">{tier.description}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">
                  그림 {tier.minCount}~{tier.maxCount}개 중 1개
                </span>
                <span className="font-bold text-indigo-600">{tier.price.toLocaleString()}원</span>
              </div>
              <div className="mt-2 text-xs text-neutral-400">재고 {stock}개</div>
            </Link>
          );
        })}
        {tiers.length === 0 && (
          <p className="text-neutral-400 col-span-full text-center py-16">
            등록된 상품이 없습니다.
          </p>
        )}
      </section>
    </div>
  );
}
