import { SlashCommandBuilder } from "discord.js";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { requestRefund, RefundError } from "@/lib/refunds";
import { prisma } from "@/lib/prisma";
import type { BotCommand } from "@/bot/types";

export const refundRequestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("환불신청")
    .setDescription("구매한 주문의 환불을 신청합니다.")
    .addStringOption((o) => o.setName("주문번호").setDescription("예: 20260905000001").setRequired(true))
    .addStringOption((o) => o.setName("사유").setDescription("환불 사유").setRequired(true)),
  async execute(interaction) {
    const orderNo = interaction.options.getString("주문번호", true).replace(/^#/, "");
    const reason = interaction.options.getString("사유", true);
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);

    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.userId !== user.id) {
      return interaction.reply({ embeds: [errorEmbed("해당 주문을 찾을 수 없습니다.")], ephemeral: true });
    }

    try {
      await requestRefund(order.id, user.id, reason);
    } catch (e) {
      const message = e instanceof RefundError ? e.message : "환불 신청 중 오류가 발생했습니다.";
      return interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
    await interaction.reply({ embeds: [successEmbed("환불 신청이 접수되었습니다.")], ephemeral: true });
  },
};
