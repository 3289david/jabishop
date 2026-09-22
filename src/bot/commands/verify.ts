import { SlashCommandBuilder } from "discord.js";
import { verifyPanelEmbed, verifyPanelRow } from "@/bot/panels";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import type { BotCommand } from "@/bot/types";

export const verifyPanelCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("인증패널").setDescription("[관리자] 인증 채널에 인증 안내 패널을 엽니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    await interaction.reply({ embeds: [verifyPanelEmbed()], components: [verifyPanelRow()] });
  },
};
