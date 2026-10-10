import { prisma } from "@/lib/prisma";
import { ORDER_STATUS, ARTWORK_STATUS, ADMIN_ROLE, ADMIN_STATUS, TOPUP_STATUS } from "@/lib/constants";
import { won } from "@/bot/format";
import { buildPanel } from "@/bot/ui";
import { getShopName } from "@/lib/shop";

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

/** 일반 회원도 볼 수 있는 공개 통계 패널 - 관리자 전용 정보(환불/문의 대기 등)는 포함하지 않는다. */
export async function publicStatsPayload() {
  const excludedUserIds = await getAdminExcludedUserIds();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    todayOrders,
    allCompletedOrders,
    memberCount,
    buyerRows,
    stockCount,
    todayRevAdj,
    allRevAdj,
    todayCostAdj,
    allCostAdj,
    todayTopups,
    allTopups,
  ] = await Promise.all([
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
    // 매출 = 포인트 구매(주문) 금액이 아니라 실제로 입금 확인된(계좌이체 승인된) 금액.
    prisma.pointTopUpRequest.findMany({
      where: { status: TOPUP_STATUS.CONFIRMED, confirmedAt: { gte: todayStart }, userId: { notIn: excludedUserIds } },
      select: { amount: true },
    }),
    prisma.pointTopUpRequest.findMany({
      where: { status: TOPUP_STATUS.CONFIRMED, userId: { notIn: excludedUserIds } },
      select: { amount: true },
    }),
  ]);

  const todayRevenue =
    todayTopups.reduce((sum, t) => sum + t.amount, 0) + todayRevAdj.reduce((sum, a) => sum + a.amount, 0);
  const totalRevenue =
    allTopups.reduce((sum, t) => sum + t.amount, 0) + allRevAdj.reduce((sum, a) => sum + a.amount, 0);

  const todayCost =
    todayOrders.reduce((sum, o) => sum + (o.tier.costPrice ?? 0), 0) + todayCostAdj.reduce((sum, a) => sum + a.amount, 0);
  const totalCost =
    allCompletedOrders.reduce((sum, o) => sum + (o.tier.costPrice ?? 0), 0) + allCostAdj.reduce((sum, a) => sum + a.amount, 0);

  const todayProfit = todayRevenue - todayCost;
  const totalProfit = totalRevenue - totalCost;

  const shopName = await getShopName();
  return buildPanel({
    title: `📊 ${shopName} 실시간 현황`,
    description: `${shopName}의 오늘/누적 판매 현황이에요. 몇 분마다 자동으로 갱신됩니다.`,
    fields: [
      { name: "💰 오늘 매출", value: won(todayRevenue) },
      { name: "🧾 오늘 판매", value: `${todayOrders.length}건` },
      { name: todayProfit >= 0 ? "🟢 오늘 순이익" : "🔴 오늘 적자", value: won(todayProfit) },
      { name: "🏆 누적 매출", value: won(totalRevenue) },
      { name: totalProfit >= 0 ? "🟢 누적 순이익" : "🔴 누적 적자", value: won(totalProfit) },
      { name: "👥 회원 수", value: `${memberCount.toLocaleString()}명` },
      { name: "🛍️ 구매자 수", value: `${buyerRows.length.toLocaleString()}명` },
      { name: "📦 판매 중인 계정", value: `${stockCount.toLocaleString()}개` },
    ],
    banner: true,
  });
}
