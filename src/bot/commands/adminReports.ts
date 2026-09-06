import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const reportListAdminCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("신고목록").setDescription("[관리자] 처리 대기 중인 신고를 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const reports = await prisma.report.findMany({
      where: { status: "PENDING" },
      include: { reporter: true },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    const embed = baseEmbed("🚨 처리 대기 신고");
    if (reports.length === 0) embed.setDescription("대기 중인 신고가 없습니다.");
    for (const r of reports) {
      embed.addFields({
        name: `${r.targetType} · ${r.reporter.name}`,
        value: `사유: ${r.reason}\n대상ID: ${r.targetId} · ID: \`${r.id}\``,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const reportResolveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("신고처리")
    .setDescription("[관리자] 신고를 처리 완료로 표시합니다.")
    .addStringOption((o) => o.setName("신고id").setDescription("/신고목록에서 확인한 ID").setRequired(true))
    .addStringOption((o) => o.setName("처리내용").setDescription("처리 내용")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("신고id", true);
    const processResult = interaction.options.getString("처리내용") ?? null;

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 신고입니다.")], ephemeral: true });

    await prisma.report.update({
      where: { id },
      data: { status: "RESOLVED", processedByAdminId: admin.id, processResult, processedAt: new Date() },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "REPORT_RESOLVE", target: id } });
    await interaction.reply({ embeds: [successEmbed("신고를 처리 완료로 표시했습니다.")], ephemeral: true });
  },
};
