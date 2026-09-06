import { SlashCommandBuilder } from "discord.js";
import { getLinkedAdmin } from "@/bot/discordAuth";
import { prisma } from "@/lib/prisma";
import { errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const adminUnlinkCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("관리자연동해제").setDescription("이 디스코드 계정의 관리자 연동을 해제합니다."),
  async execute(interaction) {
    const admin = await getLinkedAdmin(interaction.user.id);
    if (!admin) return interaction.reply({ embeds: [errorEmbed("연동된 관리자 계정이 없습니다.")], ephemeral: true });

    await prisma.adminUser.update({ where: { id: admin.id }, data: { discordId: null } });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "DISCORD_UNLINK" } });
    await interaction.reply({ embeds: [successEmbed("연동이 해제되었습니다.")], ephemeral: true });
  },
};
