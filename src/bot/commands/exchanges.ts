import { SlashCommandBuilder } from "discord.js";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { requestExchange, ExchangeError } from "@/lib/exchanges";
import { saveBufferToUploads } from "@/bot/fileStorage";
import { prisma } from "@/lib/prisma";
import type { BotCommand } from "@/bot/types";

export const exchangeRequestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("교환신청")
    .setDescription("지급받은 계정의 교환(재추첨)을 신청합니다.")
    .addStringOption((o) => o.setName("주문번호").setDescription("예: 20260905000001").setRequired(true))
    .addStringOption((o) => o.setName("사유").setDescription("교환 사유").setRequired(true))
    .addAttachmentOption((o) => o.setName("증빙파일").setDescription("문제를 확인할 수 있는 스크린샷 등").setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const orderNo = interaction.options.getString("주문번호", true).replace(/^#/, "");
    const reason = interaction.options.getString("사유", true);
    const attachment = interaction.options.getAttachment("증빙파일", true);
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);

    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.userId !== user.id) {
      return interaction.editReply({ embeds: [errorEmbed("해당 주문을 찾을 수 없습니다.")] });
    }

    const res = await fetch(attachment.url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const proofFileKey = await saveBufferToUploads(buffer, attachment.name, "attachments");

    try {
      await requestExchange(order.id, user.id, reason, proofFileKey);
    } catch (e) {
      const message = e instanceof ExchangeError ? e.message : "교환 신청 중 오류가 발생했습니다.";
      return interaction.editReply({ embeds: [errorEmbed(message)] });
    }
    await interaction.editReply({
      embeds: [successEmbed("교환 신청이 접수되었습니다. 관리자 승인 후 새 계정이 지급됩니다.")],
    });
  },
};
