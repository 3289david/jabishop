import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, won } from "@/bot/format";
import { ORDER_STATUS, ARTWORK_STATUS, REFUND_STATUS, INQUIRY_STATUS } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

export async function statsEmbed() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [todayOrders, stockCount, memberCount, pendingRefunds, waitingInquiries] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: { gte: todayStart }, status: { not: ORDER_STATUS.CANCELLED } } }),
    prisma.artwork.count({ where: { status: ARTWORK_STATUS.AVAILABLE } }),
    prisma.user.count(),
    prisma.refundRequest.count({ where: { status: REFUND_STATUS.PENDING } }),
    prisma.inquiry.count({ where: { status: INQUIRY_STATUS.WAITING } }),
  ]);

  const todayRevenue = todayOrders
    .filter((o) => o.status === ORDER_STATUS.COMPLETED)
    .reduce((sum, o) => sum + o.finalAmount, 0);

  return baseEmbed("📊 관리자 대시보드").addFields(
    { name: "오늘 매출", value: won(todayRevenue), inline: true },
    { name: "오늘 주문", value: `${todayOrders.length}건`, inline: true },
    { name: "현재 그림 재고", value: `${stockCount}개`, inline: true },
    { name: "회원 수", value: `${memberCount.toLocaleString()}명`, inline: true },
    { name: "환불 요청", value: `${pendingRefunds}건`, inline: true },
    { name: "문의", value: `${waitingInquiries}건`, inline: true }
  );
}

export const statsCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("통계").setDescription("[관리자] 오늘의 매출/주문 통계를 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const embed = await statsEmbed();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
