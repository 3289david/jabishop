import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import { approveRefund, rejectRefund, RefundError } from "@/lib/refunds";
import type { BotCommand } from "@/bot/types";

export const refundListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("환불목록").setDescription("[관리자] 대기 중인 환불 요청을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const refunds = await prisma.refundRequest.findMany({
      where: { status: "PENDING" },
      include: { user: true, order: { include: { tier: true } } },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    const embed = baseEmbed("💰 대기 중인 환불 요청");
    if (refunds.length === 0) embed.setDescription("대기 중인 요청이 없습니다.");
    for (const r of refunds) {
      embed.addFields({
        name: `#${r.order.orderNo} · ${r.order.tier.name} · ${r.order.finalAmount.toLocaleString()}P`,
        value: `회원: ${r.user.name} · 사유: ${r.reason} · ID: \`${r.id}\``,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const refundApproveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("환불승인")
    .setDescription("[관리자] 환불 요청을 승인합니다.")
    .addStringOption((o) => o.setName("환불id").setDescription("/환불목록에서 확인한 ID").setRequired(true)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("환불id", true);
    try {
      await approveRefund(id, admin.id);
    } catch (e) {
      return interaction.reply({
        embeds: [errorEmbed(e instanceof RefundError ? e.message : "처리 중 오류가 발생했습니다.")],
        ephemeral: true,
      });
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "REFUND_APPROVE", target: id } });
    await interaction.reply({ embeds: [successEmbed("환불을 승인했습니다.")], ephemeral: true });
  },
};

export const refundRejectCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("환불거절")
    .setDescription("[관리자] 환불 요청을 거절합니다.")
    .addStringOption((o) => o.setName("환불id").setDescription("/환불목록에서 확인한 ID").setRequired(true))
    .addStringOption((o) => o.setName("사유").setDescription("거절 사유")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("환불id", true);
    const note = interaction.options.getString("사유") ?? undefined;
    try {
      await rejectRefund(id, admin.id, note);
    } catch (e) {
      return interaction.reply({
        embeds: [errorEmbed(e instanceof RefundError ? e.message : "처리 중 오류가 발생했습니다.")],
        ephemeral: true,
      });
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "REFUND_REJECT", target: id, detail: note } });
    await interaction.reply({ embeds: [successEmbed("환불 요청을 거절했습니다.")], ephemeral: true });
  },
};
