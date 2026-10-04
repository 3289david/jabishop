import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { errorEmbed, baseEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

// "자판기 통째로 구매"는 슬래시 커맨드가 아니라 상품 목록 패널의 버튼(🏪 자판기(샵)
// 통째로 구매 -> 모달)으로만 진입한다 - src/bot/interactions/modals.ts의
// showShopBuyModal/handleShopBuyModalSubmit 참고.

export const shopClaimCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("샵연동")
    .setDescription("구매한 샵을 지금 이 디스코드 서버와 연결합니다.")
    .addStringOption((o) => o.setName("서브도메인").setDescription("구매할 때 정한 서브도메인").setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const slug = interaction.options.getString("서브도메인", true).trim().toLowerCase();
    const guildId = interaction.guildId;

    if (!guildId) {
      return interaction.editReply({ embeds: [errorEmbed("서버 안에서만 사용할 수 있습니다.")] });
    }

    const shop = await prisma.shop.findUnique({ where: { slug } });
    if (!shop) return interaction.editReply({ embeds: [errorEmbed("존재하지 않는 샵입니다.")] });
    if (shop.claimDiscordId !== interaction.user.id) {
      return interaction.editReply({ embeds: [errorEmbed("이 샵을 구매한 본인만 연동할 수 있습니다.")] });
    }
    if (shop.discordGuildId) {
      return interaction.editReply({ embeds: [errorEmbed("이미 다른 서버와 연동되어 있습니다.")] });
    }
    const already = await prisma.shop.findUnique({ where: { discordGuildId: guildId } });
    if (already) {
      return interaction.editReply({ embeds: [errorEmbed("이 서버는 이미 다른 샵과 연동되어 있습니다.")] });
    }

    await prisma.shop.update({ where: { id: shop.id }, data: { discordGuildId: guildId } });
    await interaction.editReply({
      embeds: [
        baseEmbed("✅ 연동 완료").setDescription(
          `이 서버가 "${shop.name}"(${shop.slug}.krl.kr)과 연동되었습니다.\n이제 이 서버에서 자비샵의 모든 기능을 사용할 수 있습니다.`
        ),
      ],
    });
  },
};
