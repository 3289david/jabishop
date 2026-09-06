import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const broadcastCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("공지발송")
    .setDescription("[관리자] 전체 회원에게 공지 알림을 발송합니다.")
    .addStringOption((o) => o.setName("제목").setDescription("공지 제목").setRequired(true))
    .addStringOption((o) => o.setName("내용").setDescription("공지 내용").setRequired(true).setMaxLength(1500)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const title = interaction.options.getString("제목", true);
    const message = interaction.options.getString("내용", true);

    await prisma.notification.create({ data: { type: "NOTICE", title, message, broadcast: true } });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "NOTICE_BROADCAST", detail: title } });
    await interaction.reply({ embeds: [successEmbed("전체 공지가 발송되었습니다.")], ephemeral: true });
  },
};
