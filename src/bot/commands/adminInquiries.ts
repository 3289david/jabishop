import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const inquiryListAdminCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("문의목록").setDescription("[관리자] 답변 대기 중인 문의를 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const inquiries = await prisma.inquiry.findMany({
      where: { status: "WAITING" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    const embed = baseEmbed("💬 답변 대기 문의");
    if (inquiries.length === 0) embed.setDescription("대기 중인 문의가 없습니다.");
    for (const i of inquiries) {
      embed.addFields({ name: `${i.title} (${i.user.name})`, value: `ID: \`${i.id}\`\n${i.content.slice(0, 150)}` });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const inquiryAnswerCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("문의답변")
    .setDescription("[관리자] 문의에 답변을 등록합니다.")
    .addStringOption((o) => o.setName("문의id").setDescription("/문의목록에서 확인한 ID").setRequired(true))
    .addStringOption((o) => o.setName("답변").setDescription("답변 내용").setRequired(true).setMaxLength(2000)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("문의id", true);
    const answer = interaction.options.getString("답변", true);

    const inquiry = await prisma.inquiry.findUnique({ where: { id } });
    if (!inquiry) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 문의입니다.")], ephemeral: true });

    await prisma.inquiry.update({
      where: { id },
      data: { answer, status: "ANSWERED", answeredByAdminId: admin.id, answeredAt: new Date() },
    });
    await prisma.notification.create({
      data: { userId: inquiry.userId, type: "INQUIRY_ANSWERED", title: "문의 답변 완료", message: `"${inquiry.title}" 문의에 답변이 등록되었습니다.` },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "INQUIRY_ANSWER", target: id } });
    await interaction.reply({ embeds: [successEmbed("답변이 등록되었습니다.")], ephemeral: true });
  },
};
