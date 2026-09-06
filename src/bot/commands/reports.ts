import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const reportCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("신고하기")
    .setDescription("상품/리뷰/사용자 등을 신고합니다.")
    .addStringOption((o) =>
      o
        .setName("유형")
        .setDescription("신고 대상 유형")
        .setRequired(true)
        .addChoices(
          { name: "상품", value: "PRODUCT" },
          { name: "리뷰", value: "REVIEW" },
          { name: "사용자", value: "USER" },
          { name: "기타", value: "OTHER" }
        )
    )
    .addStringOption((o) => o.setName("대상id").setDescription("신고 대상의 ID/코드/주문번호 등").setRequired(true))
    .addStringOption((o) => o.setName("사유").setDescription("신고 사유").setRequired(true))
    .addStringOption((o) => o.setName("상세").setDescription("상세 설명 (선택)").setMaxLength(1000)),
  async execute(interaction) {
    const targetType = interaction.options.getString("유형", true);
    const targetId = interaction.options.getString("대상id", true);
    const reason = interaction.options.getString("사유", true);
    const detail = interaction.options.getString("상세") ?? null;
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);

    await prisma.report.create({
      data: {
        reporterId: user.id,
        targetType,
        targetId,
        reviewTargetId: targetType === "REVIEW" ? targetId : null,
        reason,
        detail,
      },
    });
    await interaction.reply({ embeds: [successEmbed("신고가 접수되었습니다.")], ephemeral: true });
  },
};
