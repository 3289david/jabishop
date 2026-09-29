import { prisma } from "@/lib/prisma";
import { ORDER_STATUS } from "@/lib/constants";
import { getAdminExcludedUserIds } from "@/bot/publicStats";

/** 누적 구매금액(완료 주문 기준) TOP N. 최고관리자 구매는 공개 통계와 동일한 기준으로 제외한다. */
export async function getTopSpenders(limit: number) {
  const excludedUserIds = await getAdminExcludedUserIds();

  const grouped = await prisma.order.groupBy({
    by: ["userId"],
    where: { status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
    _sum: { finalAmount: true },
    orderBy: { _sum: { finalAmount: "desc" } },
    take: limit,
  });

  const userIds = grouped.map((g) => g.userId).filter((id): id is string => id != null);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return grouped
    .filter((g): g is typeof g & { userId: string } => g.userId != null && userMap.has(g.userId))
    .map((g, i) => ({
      rank: i + 1,
      user: userMap.get(g.userId)!,
      totalSpend: g._sum.finalAmount ?? 0,
    }));
}
