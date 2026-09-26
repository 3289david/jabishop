import { prisma } from "@/lib/prisma";
import { ORDER_STATUS, ARTWORK_STATUS } from "@/lib/constants";
import { fetchGuildMemberIdsWithRole } from "@/lib/discordNotify";
import { baseEmbed, won } from "@/bot/format";

/**
 * 관리자 역할(ShopSetting.discordAdminRoleId) 보유자의 구매는 공개 통계에서 제외하기 위해,
 * 그 역할을 가진 멤버들의 내부 회원(User) ID 목록을 반환한다. 역할이 설정 안 돼있으면 빈 배열.
 */
async function getExcludedUserIds(discordAdminRoleId: string | null): Promise<string[]> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!discordAdminRoleId || !guildId) return [];

  const discordIds = await fetchGuildMemberIdsWithRole(guildId, discordAdminRoleId);
  if (discordIds.length === 0) return [];

  const users = await prisma.user.findMany({ where: { discordId: { in: discordIds } }, select: { id: true } });
  return users.map((u) => u.id);
}

/** 일반 회원도 볼 수 있는 공개 통계 임베드 - 관리자 전용 정보(환불/문의 대기 등)는 포함하지 않는다. */
export async function publicStatsEmbed() {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const excludedUserIds = await getExcludedUserIds(settings?.discordAdminRoleId ?? null);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [todayOrders, allCompletedOrders, memberCount, buyerRows, stockCount] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: todayStart }, status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
      select: { finalAmount: true },
    }),
    prisma.order.findMany({
      where: { status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
      select: { finalAmount: true },
    }),
    prisma.user.count(),
    prisma.order.findMany({
      where: { status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.artwork.count({ where: { status: ARTWORK_STATUS.AVAILABLE } }),
  ]);

  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.finalAmount, 0);
  const totalRevenue = allCompletedOrders.reduce((sum, o) => sum + o.finalAmount, 0);

  return baseEmbed("📊 자비샵 실시간 현황")
    .setDescription("자비샵의 오늘/누적 판매 현황이에요. 몇 분마다 자동으로 갱신됩니다.")
    .addFields(
      { name: "💰 오늘 매출", value: won(todayRevenue), inline: true },
      { name: "🧾 오늘 판매", value: `${todayOrders.length}건`, inline: true },
      { name: "🏆 누적 매출", value: won(totalRevenue), inline: true },
      { name: "👥 회원 수", value: `${memberCount.toLocaleString()}명`, inline: true },
      { name: "🛍️ 구매자 수", value: `${buyerRows.length.toLocaleString()}명`, inline: true },
      { name: "📦 판매 중인 계정", value: `${stockCount.toLocaleString()}개`, inline: true }
    )
    .setTimestamp();
}
