import { SlashCommandBuilder, ChannelType } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, won, errorEmbed, successEmbed } from "@/bot/format";
import { ORDER_STATUS, ARTWORK_STATUS, REFUND_STATUS, INQUIRY_STATUS } from "@/lib/constants";
import { publicStatsEmbed, getAdminExcludedUserIds } from "@/bot/publicStats";
import { updatePublicStatsPanel } from "@/bot/publicStatsLoop";
import type { BotCommand } from "@/bot/types";

export async function statsEmbed() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 최고관리자(SUPER) 계정의 구매는 매출/원가/순이익 집계에서 제외한다 (공개 통계 패널과 동일한
  // 기준, 과거 주문 포함 - 언제 결제했든 지금 SUPER 권한이면 전부 제외).
  const excludedUserIds = await getAdminExcludedUserIds();

  const [todayOrders, stockCount, memberCount, pendingRefunds, waitingInquiries, todayRevenueOrders, allRevenueOrders, todayCostAdj, allCostAdj] =
    await Promise.all([
      prisma.order.findMany({ where: { createdAt: { gte: todayStart }, status: { not: ORDER_STATUS.CANCELLED } } }),
      prisma.artwork.count({ where: { status: ARTWORK_STATUS.AVAILABLE } }),
      prisma.user.count(),
      prisma.refundRequest.count({ where: { status: REFUND_STATUS.PENDING } }),
      prisma.inquiry.count({ where: { status: INQUIRY_STATUS.WAITING } }),
      prisma.order.findMany({
        where: { createdAt: { gte: todayStart }, status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
        include: { tier: true },
      }),
      prisma.order.findMany({
        where: { status: ORDER_STATUS.COMPLETED, userId: { notIn: excludedUserIds } },
        include: { tier: true },
      }),
      prisma.manualCostAdjustment.findMany({ where: { createdAt: { gte: todayStart } }, select: { amount: true } }),
      prisma.manualCostAdjustment.findMany({ select: { amount: true } }),
    ]);

  const todayRevenue = todayRevenueOrders.reduce((sum, o) => sum + o.finalAmount, 0);
  const todayCost =
    todayRevenueOrders.reduce((sum, o) => sum + (o.tier.costPrice ?? 0), 0) + todayCostAdj.reduce((sum, a) => sum + a.amount, 0);
  const todayProfit = todayRevenue - todayCost;

  const totalRevenue = allRevenueOrders.reduce((sum, o) => sum + o.finalAmount, 0);
  const totalCost =
    allRevenueOrders.reduce((sum, o) => sum + (o.tier.costPrice ?? 0), 0) + allCostAdj.reduce((sum, a) => sum + a.amount, 0);
  const totalProfit = totalRevenue - totalCost;

  return baseEmbed("📊 관리자 대시보드").addFields(
    { name: "오늘 매출", value: won(todayRevenue), inline: true },
    { name: "오늘 원가", value: won(todayCost), inline: true },
    { name: "오늘 순이익", value: `${todayProfit >= 0 ? "🟢 흑자" : "🔴 적자"} ${won(todayProfit)}`, inline: true },
    { name: "오늘 주문", value: `${todayOrders.length}건`, inline: true },
    { name: "현재 계정 재고", value: `${stockCount}개`, inline: true },
    { name: "회원 수", value: `${memberCount.toLocaleString()}명`, inline: true },
    {
      name: "누적 순이익",
      value: `${totalProfit >= 0 ? "🟢 흑자" : "🔴 적자"} ${won(totalProfit)} (매출 ${won(totalRevenue)} - 원가 ${won(totalCost)})`,
    },
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

export const publicStatsPanelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("공개통계패널")
    .setDescription("[관리자] 일반 회원도 볼 수 있는 실시간 매출/현황 패널을 채널에 올립니다 (자동 갱신).")
    .addChannelOption((o) =>
      o.setName("채널").setDescription("패널을 게시할 채널").setRequired(true).addChannelTypes(ChannelType.GuildText)
    ),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const channelOption = interaction.options.getChannel("채널", true);
    const channel = await interaction.guild?.channels.fetch(channelOption.id).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      return interaction.editReply({ embeds: [errorEmbed("텍스트 채널만 선택할 수 있습니다.")] });
    }

    const embed = await publicStatsEmbed();
    const sent = await channel.send({ embeds: [embed] });

    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: { publicStatsChannelId: channel.id, publicStatsMessageId: sent.id },
      create: {
        id: "singleton",
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolder: "",
        publicStatsChannelId: channel.id,
        publicStatsMessageId: sent.id,
      },
    });

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "PUBLIC_STATS_PANEL_SET", target: channel.id } });
    await interaction.editReply({
      embeds: [successEmbed(`<#${channel.id}> 채널에 공개 통계 패널을 게시했습니다. 5분마다 자동으로 갱신됩니다.`)],
    });
  },
};

export const revenueAddCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("이익추가")
    .setDescription("[관리자] 오프라인 판매 등 실제 주문이 아닌 금액을 매출 통계에 수동으로 더합니다.")
    .addIntegerOption((o) => o.setName("금액").setDescription("더할 금액(원). 취소하려면 음수 입력").setRequired(true))
    .addStringOption((o) => o.setName("메모").setDescription("어떤 이익인지 메모 (선택)")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const amount = interaction.options.getInteger("금액", true);
    const memo = interaction.options.getString("메모") ?? undefined;
    await interaction.deferReply({ ephemeral: true });

    if (amount === 0) {
      return interaction.editReply({ embeds: [errorEmbed("0원은 추가할 수 없습니다.")] });
    }

    await prisma.manualRevenueAdjustment.create({ data: { amount, memo, createdByAdminId: admin.id } });
    await prisma.adminActivityLog.create({
      data: { adminId: admin.id, action: "REVENUE_ADD", detail: `${amount.toLocaleString()}원${memo ? ` (${memo})` : ""}` },
    });

    await updatePublicStatsPanel(interaction.client).catch(() => {});

    await interaction.editReply({
      embeds: [successEmbed(`매출 통계에 ${amount.toLocaleString()}원을 추가했습니다.${memo ? ` (메모: ${memo})` : ""}`)],
    });
  },
};

export const costAddCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("원가추가")
    .setDescription("[관리자] 등급에 안 걸린 원가(서버비/외주비 등)를 순이익 계산에 수동으로 더합니다.")
    .addIntegerOption((o) => o.setName("금액").setDescription("더할 원가(원). 취소하려면 음수 입력").setRequired(true))
    .addStringOption((o) => o.setName("메모").setDescription("어떤 원가인지 메모 (선택)")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const amount = interaction.options.getInteger("금액", true);
    const memo = interaction.options.getString("메모") ?? undefined;
    await interaction.deferReply({ ephemeral: true });

    if (amount === 0) {
      return interaction.editReply({ embeds: [errorEmbed("0원은 추가할 수 없습니다.")] });
    }

    await prisma.manualCostAdjustment.create({ data: { amount, memo, createdByAdminId: admin.id } });
    await prisma.adminActivityLog.create({
      data: { adminId: admin.id, action: "COST_ADD", detail: `${amount.toLocaleString()}원${memo ? ` (${memo})` : ""}` },
    });

    await updatePublicStatsPanel(interaction.client).catch(() => {});

    await interaction.editReply({
      embeds: [successEmbed(`원가에 ${amount.toLocaleString()}원을 추가했습니다.${memo ? ` (메모: ${memo})` : ""}`)],
    });
  },
};
