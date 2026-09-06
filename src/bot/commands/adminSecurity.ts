import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const loginLogsCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("로그인기록").setDescription("[관리자] 최근 관리자 로그인 기록을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const logs = await prisma.adminLoginLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
    const embed = baseEmbed("🔐 최근 로그인 기록");
    for (const l of logs) {
      embed.addFields({
        name: `${l.loginId} · ${l.success ? "성공" : "실패"}`,
        value: `${l.ip ?? "-"} · ${l.createdAt.toLocaleString("ko-KR")}${l.reason ? ` · ${l.reason}` : ""}`,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const activityLogsCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("활동로그").setDescription("[관리자] 최근 관리자 활동 로그를 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const logs = await prisma.adminActivityLog.findMany({
      include: { admin: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    const embed = baseEmbed("📝 최근 활동 로그");
    for (const l of logs) {
      embed.addFields({
        name: `${l.admin.loginId} · ${l.action}`,
        value: `${l.detail ?? "-"} · ${l.createdAt.toLocaleString("ko-KR")}`,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
