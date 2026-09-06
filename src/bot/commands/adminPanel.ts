import { SlashCommandBuilder } from "discord.js";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { adminPanelEmbed, adminPanelRows } from "@/bot/panels";
import type { BotCommand } from "@/bot/types";

export const adminPanelCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("관리자패널").setDescription("[관리자] 버튼으로 이용하는 관리자 패널을 엽니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    await interaction.reply({ embeds: [adminPanelEmbed()], components: adminPanelRows(), ephemeral: true });
  },
};
