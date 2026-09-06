import { SlashCommandBuilder } from "discord.js";
import { mainPanelEmbed, mainPanelRows } from "@/bot/panels";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import type { BotCommand } from "@/bot/types";

export const panelCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("패널").setDescription("[관리자] 버튼으로 이용하는 자비샵 메인 패널을 엽니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    await interaction.reply({ embeds: [mainPanelEmbed()], components: mainPanelRows() });
  },
};
