import { SlashCommandBuilder, ChannelType, EmbedBuilder, type TextChannel } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed, successEmbed, BRAND_COLOR } from "@/bot/format";
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

const HEX_COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

export const channelAnnounceCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("채널공지")
    .setDescription("[관리자] 원하는 채널에 예쁜 임베드 공지를 올립니다.")
    .addChannelOption((o) =>
      o.setName("채널").setDescription("공지를 올릴 채널").setRequired(true).addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption((o) => o.setName("제목").setDescription("공지 제목").setRequired(true))
    .addStringOption((o) => o.setName("내용").setDescription("공지 내용").setRequired(true).setMaxLength(1900))
    .addStringOption((o) => o.setName("이미지url").setDescription("공지에 넣을 이미지 URL (선택)"))
    .addStringOption((o) => o.setName("색상").setDescription("임베드 색상 hex, 예: #5865F2 (선택, 비우면 기본 색)")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const channelOption = interaction.options.getChannel("채널", true);
    const title = interaction.options.getString("제목", true);
    const content = interaction.options.getString("내용", true);
    const imageUrl = interaction.options.getString("이미지url");
    const colorInput = interaction.options.getString("색상");

    if (colorInput && !HEX_COLOR_RE.test(colorInput)) {
      return interaction.editReply({ embeds: [errorEmbed("색상은 #5865F2 같은 hex 형식으로 입력해주세요.")] });
    }
    const color = colorInput ? parseInt(colorInput.replace("#", ""), 16) : BRAND_COLOR;

    const channel = await interaction.guild?.channels.fetch(channelOption.id).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return interaction.editReply({ embeds: [errorEmbed("텍스트 채널만 선택할 수 있습니다.")] });
    }

    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(content).setTimestamp();
    if (imageUrl) embed.setImage(imageUrl);

    await (channel as TextChannel).send({ embeds: [embed] });

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "CHANNEL_ANNOUNCE", target: channel.id, detail: title } });
    await interaction.editReply({ embeds: [successEmbed(`<#${channel.id}> 채널에 공지를 게시했습니다.`)] });
  },
};
