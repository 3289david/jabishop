import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { exchangeOrderArtwork, OrderError } from "@/lib/orders";
import type { BotCommand } from "@/bot/types";

export const orderExchangeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("계정교환")
    .setDescription("[관리자] 완료된 주문의 계정을 같은 등급의 다른 재고로 교환(재추첨)합니다.")
    .addStringOption((o) => o.setName("주문번호").setDescription("예: 20260905000001").setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const admin = await requireLinkedAdmin(interaction.user.id);
    const orderNo = interaction.options.getString("주문번호", true).replace(/^#/, "");

    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order) return interaction.editReply({ embeds: [errorEmbed("존재하지 않는 주문번호입니다.")] });

    try {
      const result = await exchangeOrderArtwork(order.id);
      await prisma.adminActivityLog.create({
        data: {
          adminId: admin.id,
          action: "ORDER_EXCHANGE",
          target: order.id,
          detail: `${result.oldArtwork.code} → ${result.newArtwork.code}`,
        },
      });
      await interaction.editReply({
        embeds: [successEmbed(`주문 #${orderNo}을(를) "${result.newArtwork.code}"로 교환해 재발송했습니다.`)],
      });
    } catch (e) {
      const message = e instanceof OrderError ? e.message : "교환 중 오류가 발생했습니다.";
      await interaction.editReply({ embeds: [errorEmbed(message)] });
    }
  },
};
