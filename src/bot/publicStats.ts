import { prisma } from "@/lib/prisma";
import { ORDER_STATUS, ARTWORK_STATUS, ADMIN_ROLE, ADMIN_STATUS } from "@/lib/constants";
import { baseEmbed, won } from "@/bot/format";

/**
 * 최고관리자(AdminUser.role === SUPER, 연동된 계정)의 구매는 매출 통계에서 제외하기 위해,
 * 그 계정들의 내부 회원(User) ID 목록을 반환한다. 최고관리자가 없으면 빈 배열.
 * 공개 통계 패널뿐 아니라 관리자 대시보드(/통계)의 누적 매출/순이익 계산에도 똑같이 쓰인다.
 */
export async function getAdminExcludedUserIds(): Promise<string[]> {
  const superAdmins = await prisma.adminUser.findMany({
    where: { role: ADMIN_ROLE.SUPER, status: ADMIN_STATUS.ACTIVE, discordId: { not: null } },
    select: { discordId: true },
  });
  const discordIds = superAdmins.map((a) => a.discordId).filter((id): id is string => !!id);
  if (discordIds.length === 0) return [];

  const users = await prisma.user.findMany({ where: { discordId: { in: discordIds } }, select: { id: true } });
  return users.map((u) => u.id);
}

/** 일반 회원도 볼 수 있는 공개 통계 임베드 - 관리자 전용 정보(환불/문의 대기 등)는 포함하지 않는다. */
export async function publicStatsEmbed() {
  const excludedUserIds = await getAdminExcludedUserIds();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [todayOrders, allCompletedOrders, memberCount, buyerRows, stockCount, todayRevAdj, allRevAdj, todayCostAdj, allCostAdj] =
    await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: todayStart }, status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
        select: { finalAmount: true, tier: { select: { costPrice: true } } },
      }),
      prisma.order.findMany({
        where: { status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
        select: { finalAmount: true, tier: { select: { costPrice: true } } },
      }),
      prisma.user.count(),
      prisma.order.findMany({
        where: { status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
        distinct: ["userId"],
        select: { userId: true },
      }),
      prisma.artwork.count({ where: { status: ARTWORK_STATUS.AVAILABLE } }),
      // 관리자가 /이익추가·/원가추가로 수동으로 더한 매출/원가 (오프라인 판매 등)도 오늘/누적에 반영한다.
      prisma.manualRevenueAdjustment.findMany({ where: { createdAt: { gte: todayStart } }, select: { amount: true } }),
      prisma.manualRevenueAdjustment.findMany({ select: { amount: true } }),
      prisma.manualCostAdjustment.findMany({ where: { createdAt: { gte: todayStart } }, select: { amount: true } }),
      prisma.manualCostAdjustment.findMany({ select: { amount: true } }),
    ]);

  const todayRevenue =
    todayOrders.reduce((sum, o) => sum + o.finalAmount, 0) + todayRevAdj.reduce((sum, a) => sum + a.amount, 0);
  const totalRevenue =
    allCompletedOrders.reduce((sum, o) => sum + o.finalAmount, 0) + allRevAdj.reduce((sum, a) => sum + a.amount, 0);

  const todayCost =
    todayOrders.reduce((sum, o) => sum + (o.tier.costPrice ?? 0), 0) + todayCostAdj.reduce((sum, a) => sum + a.amount, 0);
  const totalCost =
    allCompletedOrders.reduce((sum, o) => sum + (o.tier.costPrice ?? 0), 0) + allCostAdj.reduce((sum, a) => sum + a.amount, 0);

  const todayProfit = todayRevenue - todayCost;
  const totalProfit = totalRevenue - totalCost;

  return baseEmbed("📊 자비샵 실시간 현황")
    .setDescription("자비샵의 오늘/누적 판매 현황이에요. 몇 분마다 자동으로 갱신됩니다.")
    .addFields(
      { name: "💰 오늘 매출", value: won(todayRevenue), inline: true },
      { name: "🧾 오늘 판매", value: `${todayOrders.length}건`, inline: true },
      { name: todayProfit >= 0 ? "🟢 오늘 순이익" : "🔴 오늘 적자", value: won(todayProfit), inline: true },
      { name: "🏆 누적 매출", value: won(totalRevenue), inline: true },
      { name: totalProfit >= 0 ? "🟢 누적 순이익" : "🔴 누적 적자", value: won(totalProfit), inline: true },
      { name: "👥 회원 수", value: `${memberCount.toLocaleString()}명`, inline: true },
      { name: "🛍️ 구매자 수", value: `${buyerRows.length.toLocaleString()}명`, inline: true },
      { name: "📦 판매 중인 계정", value: `${stockCount.toLocaleString()}개`, inline: true }
    )
    .setTimestamp();
}
