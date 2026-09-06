import { prisma } from "@/lib/prisma";
import { toggleReviewVisibilityAction, deleteReviewAdminAction } from "@/lib/actions/adminReviews";

export default async function AdminReviewsPage() {
  const reviews = await prisma.review.findMany({
    include: { user: true, order: { include: { tier: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">리뷰 관리</h1>
      <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
        {reviews.map((r) => (
          <div key={r.id} className="p-4 flex items-start justify-between gap-4">
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.user.name}</span>
                <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                <span className="text-xs text-neutral-400">{r.order.tier.name}</span>
                <span className="text-xs bg-neutral-100 px-1.5 rounded">{r.status}</span>
              </div>
              <p className="mt-1 text-neutral-600">{r.content}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <form action={toggleReviewVisibilityAction}>
                <input type="hidden" name="id" value={r.id} />
                <button className="text-xs border border-neutral-300 px-2 py-1 rounded hover:bg-neutral-50">
                  {r.status === "VISIBLE" ? "숨기기" : "노출하기"}
                </button>
              </form>
              <form action={deleteReviewAdminAction}>
                <input type="hidden" name="id" value={r.id} />
                <button className="text-xs text-red-500 px-2 py-1 hover:underline">삭제</button>
              </form>
            </div>
          </div>
        ))}
        {reviews.length === 0 && <p className="text-center text-neutral-400 py-10">리뷰가 없습니다.</p>}
      </div>
    </div>
  );
}
