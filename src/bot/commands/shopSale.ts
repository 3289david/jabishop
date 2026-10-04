import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { errorEmbed, baseEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

// "자판기 통째로 구매"는 슬래시 커맨드가 아니라 상품 목록의 다른 등급과 똑같이
// "구매하기" 버튼으로 산다 - src/lib/orders.ts의 purchaseTier 참고. 디스코드 전용
// 서비스라 별도 웹사이트는 없다.

export const shopClaimCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("샵연동")
    .setDescription("구매한 샵을 지금 이 디스코드 서버와 연결합니다.")
    .addStringOption((o) => o.setName("샵코드").setDescription("구매 완료 메시지에 적혀있던 샵 코드").setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const slug = interaction.options.getString("샵코드", true).trim().toLowerCase();
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
          `이 서버가 "${shop.name}"(${shop.slug}) 샵과 연동되었습니다.\n이제 이 서버에서 상품 구매/쿠폰/장바구니/관리자 패널 등 모든 기능을 사용할 수 있습니다.`
        ),
      ],
    });
  },
};
