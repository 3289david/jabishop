import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { STICKY_KIND } from "@/lib/constants";
import { repostSticky } from "@/bot/stickyMessage";
import type { BotCommand } from "@/bot/types";

export const adminPanelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("관리자패널")
    .setDescription("[관리자] 버튼으로 이용하는 관리자 패널을 이 채널 맨 아래에 고정합니다."),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return interaction.editReply({ embeds: [errorEmbed("텍스트 채널에서만 사용할 수 있습니다.")] });
    }

    await prisma.stickyMessage.upsert({
      where: { channelId: channel.id },
      update: { kind: STICKY_KIND.ADMIN_PANEL, createdByAdminId: admin.id },
      create: { channelId: channel.id, kind: STICKY_KIND.ADMIN_PANEL, createdByAdminId: admin.id },
    });

    const sent = await repostSticky(channel.id, channel);
    if (!sent) {
      return interaction.editReply({ embeds: [errorEmbed("관리자 패널을 게시하지 못했습니다. 봇 권한을 확인해주세요.")] });
    }

    await interaction.editReply({ embeds: [successEmbed("관리자 패널을 이 채널 맨 아래에 고정했습니다. (모두에게 보임)")] });
  },
};
