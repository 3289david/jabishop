import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { verifyPanelEmbed, verifyPanelRow } from "@/bot/panels";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const verifyPanelCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("인증패널").setDescription("[관리자] 인증 채널에 인증 안내 패널을 엽니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const isOwnGuild = interaction.guildId === process.env.DISCORD_GUILD_ID;
    if (!isOwnGuild) {
      const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
      if (!settings?.verifyRoleId) {
        return interaction.reply({
          embeds: [errorEmbed("먼저 `/설정수정 인증역할:`로 인증 시 지급할 역할을 설정해주세요.")],
          ephemeral: true,
        });
      }
    }
    await interaction.reply({ embeds: [await verifyPanelEmbed(isOwnGuild)], components: [verifyPanelRow(isOwnGuild)] });
  },
};
