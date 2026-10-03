import { SlashCommandBuilder, ChannelType } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { adminDutyStatusEmbed, adminDutyControlRow } from "@/bot/adminDutyPanel";
import type { BotCommand } from "@/bot/types";

export const adminDutyStatusPanelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("관리자근무현황패널")
    .setDescription("[관리자] 등록된 관리자들의 출근/퇴근/일시중지 현황판을 채널에 올립니다 (자동 갱신).")
    .addChannelOption((o) =>
      o.setName("채널").setDescription("패널을 게시할 채널").setRequired(true).addChannelTypes(ChannelType.GuildText)
    ),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const channelOption = interaction.options.getChannel("채널", true);
    const channel = await interaction.guild?.channels.fetch(channelOption.id).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      return interaction.editReply({ embeds: [errorEmbed("텍스트 채널만 선택할 수 있습니다.")] });
    }

    const embed = await adminDutyStatusEmbed();
    const sent = await channel.send({ embeds: [embed] });

    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: { adminDutyChannelId: channel.id, adminDutyMessageId: sent.id },
      create: {
        id: "singleton",
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolder: "",
        adminDutyChannelId: channel.id,
        adminDutyMessageId: sent.id,
      },
    });

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "ADMIN_DUTY_PANEL_SET", target: channel.id } });
    await interaction.editReply({
      embeds: [successEmbed(`<#${channel.id}> 채널에 관리자 근무 현황판을 게시했습니다. 온라인/오프라인에 따라 자동으로 갱신됩니다.`)],
    });
  },
};

export const adminDutyControlPanelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("관리자근무버튼패널")
    .setDescription("[관리자] 관리자가 직접 출근/퇴근/일시중지를 누를 수 있는 버튼 패널을 채널에 올립니다.")
    .addChannelOption((o) =>
      o.setName("채널").setDescription("패널을 게시할 채널").setRequired(true).addChannelTypes(ChannelType.GuildText)
    ),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const channelOption = interaction.options.getChannel("채널", true);
    const channel = await interaction.guild?.channels.fetch(channelOption.id).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      return interaction.editReply({ embeds: [errorEmbed("텍스트 채널만 선택할 수 있습니다.")] });
    }

    const sent = await channel.send({
      content: "관리자 근무 상태를 직접 바꾸려면 아래 버튼을 눌러주세요. (연동된 관리자만 사용 가능)",
      components: [adminDutyControlRow()],
    });

    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: { adminDutyControlChannelId: channel.id, adminDutyControlMessageId: sent.id },
      create: {
        id: "singleton",
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolder: "",
        adminDutyControlChannelId: channel.id,
        adminDutyControlMessageId: sent.id,
      },
    });

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "ADMIN_DUTY_CONTROL_PANEL_SET", target: channel.id } });
    await interaction.editReply({
      embeds: [successEmbed(`<#${channel.id}> 채널에 관리자 근무 상태 변경 버튼 패널을 게시했습니다.`)],
    });
  },
};
