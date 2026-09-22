import { SlashCommandBuilder } from "discord.js";
import { errorEmbed, successEmbed } from "@/bot/format";
import { requestPartner, PartnerError } from "@/lib/partners";
import type { BotCommand } from "@/bot/types";

export const partnerRequestCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("파트너신청")
    .setDescription("서버/채널 상호 홍보 파트너를 신청합니다.")
    .addStringOption((o) => o.setName("이름").setDescription("파트너로 등록할 서버/채널 이름").setRequired(true))
    .addStringOption((o) => o.setName("이모지").setDescription("생성될 채널명 앞에 붙일 이모지 (비우면 기본 🤝)"))
    .addStringOption((o) => o.setName("소개").setDescription("간단한 소개"))
    .addStringOption((o) => o.setName("웹훅url").setDescription("홍보 문구를 받을 디스코드 웹훅 URL")),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString("이름", true);
    const emoji = interaction.options.getString("이모지") ?? undefined;
    const description = interaction.options.getString("소개") ?? undefined;
    const webhookUrl = interaction.options.getString("웹훅url") ?? undefined;

    if (webhookUrl && !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
      return interaction.editReply({
        embeds: [errorEmbed("웹훅 URL 형식이 올바르지 않습니다. https://discord.com/api/webhooks/... 형태여야 합니다.")],
      });
    }

    try {
      await requestPartner({
        discordUserId: interaction.user.id,
        discordTag: interaction.user.tag,
        name,
        emoji,
        description,
        webhookUrl,
      });
    } catch (e) {
      const message = e instanceof PartnerError ? e.message : "신청 중 오류가 발생했습니다.";
      return interaction.editReply({ embeds: [errorEmbed(message)] });
    }
    await interaction.editReply({ embeds: [successEmbed("파트너 신청이 접수되었습니다. 관리자 승인을 기다려주세요.")] });
  },
};
