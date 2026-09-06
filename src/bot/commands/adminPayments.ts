import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import { confirmTopUp, rejectTopUp, TopUpError } from "@/lib/points";
import type { BotCommand } from "@/bot/types";

export const topUpListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("충전목록").setDescription("[관리자] 대기 중인 포인트 충전 신청을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const requests = await prisma.pointTopUpRequest.findMany({
      where: { status: "PENDING" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    const embed = baseEmbed("💳 대기 중인 충전 신청");
    if (requests.length === 0) embed.setDescription("대기 중인 신청이 없습니다.");
    for (const r of requests) {
      embed.addFields({
        name: `${r.amount.toLocaleString()}원 · 입금자: ${r.depositorName}`,
        value: `회원: ${r.user.name} · ID: \`${r.id}\``,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const topUpConfirmCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("충전승인")
    .setDescription("[관리자] 입금을 확인하고 포인트를 지급합니다.")
    .addStringOption((o) => o.setName("충전id").setDescription("/충전목록에서 확인한 ID").setRequired(true)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("충전id", true);
    try {
      await confirmTopUp(id, admin.id);
    } catch (e) {
      return interaction.reply({
        embeds: [errorEmbed(e instanceof TopUpError ? e.message : "처리 중 오류가 발생했습니다.")],
        ephemeral: true,
      });
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "TOPUP_CONFIRM", target: id } });
    await interaction.reply({ embeds: [successEmbed("충전을 승인하고 포인트를 지급했습니다.")], ephemeral: true });
  },
};

export const topUpRejectCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("충전거절")
    .setDescription("[관리자] 충전 신청을 거절합니다.")
    .addStringOption((o) => o.setName("충전id").setDescription("/충전목록에서 확인한 ID").setRequired(true))
    .addStringOption((o) => o.setName("사유").setDescription("거절 사유")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("충전id", true);
    const note = interaction.options.getString("사유") ?? undefined;
    try {
      await rejectTopUp(id, admin.id, note);
    } catch (e) {
      return interaction.reply({
        embeds: [errorEmbed(e instanceof TopUpError ? e.message : "처리 중 오류가 발생했습니다.")],
        ephemeral: true,
      });
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "TOPUP_REJECT", target: id, detail: note } });
    await interaction.reply({ embeds: [successEmbed("충전 신청을 거절했습니다.")], ephemeral: true });
  },
};
