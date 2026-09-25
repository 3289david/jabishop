import { SlashCommandBuilder, ChannelType } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { repostSticky } from "@/bot/stickyMessage";
import { STICKY_KIND } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

const HEX_COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

export const stickySetCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("고정메시지설정")
    .setDescription("[관리자] 지정한 채널 맨 아래에 특정 메시지가 항상 고정되어 있도록 합니다.")
    .addChannelOption((o) =>
      o.setName("채널").setDescription("메시지를 고정할 채널").setRequired(true).addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption((o) => o.setName("내용").setDescription("고정할 메시지 내용").setRequired(true).setMaxLength(1900))
    .addStringOption((o) => o.setName("제목").setDescription("임베드 제목 (선택)"))
    .addStringOption((o) => o.setName("이미지url").setDescription("고정 메시지에 넣을 이미지 URL (선택)"))
    .addStringOption((o) => o.setName("색상").setDescription("임베드 색상 hex, 예: #5865F2 (선택, 비우면 기본 색)")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const channelOption = interaction.options.getChannel("채널", true);
    const content = interaction.options.getString("내용", true);
    const title = interaction.options.getString("제목");
    const imageUrl = interaction.options.getString("이미지url");
    const colorInput = interaction.options.getString("색상");

    if (colorInput && !HEX_COLOR_RE.test(colorInput)) {
      return interaction.editReply({ embeds: [errorEmbed("색상은 #5865F2 같은 hex 형식으로 입력해주세요.")] });
    }
    const color = colorInput ? parseInt(colorInput.replace("#", ""), 16) : null;

    const channel = await interaction.guild?.channels.fetch(channelOption.id).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return interaction.editReply({ embeds: [errorEmbed("텍스트 채널만 선택할 수 있습니다.")] });
    }

    await prisma.stickyMessage.upsert({
      where: { channelId: channel.id },
      update: {
        kind: STICKY_KIND.CUSTOM,
        content,
        createdByAdminId: admin.id,
        ...(title != null ? { title } : {}),
        ...(imageUrl != null ? { imageUrl } : {}),
        ...(colorInput != null ? { color } : {}),
      },
      create: { channelId: channel.id, kind: STICKY_KIND.CUSTOM, title, content, imageUrl, color, createdByAdminId: admin.id },
    });

    const sent = await repostSticky(channel.id, channel);
    if (!sent) {
      return interaction.editReply({ embeds: [errorEmbed("고정 메시지를 게시하지 못했습니다. 봇 권한을 확인해주세요.")] });
    }

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "STICKY_SET", target: channel.id } });
    await interaction.editReply({ embeds: [successEmbed(`<#${channel.id}> 채널에 고정 메시지를 설정했습니다.`)] });
  },
};

export const stickyClearCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("고정메시지해제")
    .setDescription("[관리자] 채널의 고정 메시지 기능을 해제합니다.")
    .addChannelOption((o) =>
      o.setName("채널").setDescription("고정 메시지를 해제할 채널").setRequired(true).addChannelTypes(ChannelType.GuildText)
    ),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const channelOption = interaction.options.getChannel("채널", true);
    const sticky = await prisma.stickyMessage.findUnique({ where: { channelId: channelOption.id } });
    if (!sticky) {
      return interaction.editReply({ embeds: [errorEmbed("이 채널에는 설정된 고정 메시지가 없습니다.")] });
    }

    if (sticky.messageId) {
      const channel = await interaction.guild?.channels.fetch(channelOption.id).catch(() => null);
      if (channel?.isTextBased() && "messages" in channel) {
        const msg = await channel.messages.fetch(sticky.messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }
    }
    await prisma.stickyMessage.delete({ where: { channelId: channelOption.id } });

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "STICKY_CLEAR", target: channelOption.id } });
    await interaction.editReply({ embeds: [successEmbed(`<#${channelOption.id}> 채널의 고정 메시지를 해제했습니다.`)] });
  },
};
