import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { errorEmbed, successEmbed, baseEmbed } from "@/bot/format";
import { purchaseShopSubscription, ShopPurchaseError } from "@/lib/shopPurchase";
import type { BotCommand } from "@/bot/types";

const SHOP_SUBSCRIPTION_PRICE = 4000;

export const shopBuyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("샵구매")
    .setDescription(`자비샵을 자기 이름으로 통째로 구매합니다 (월 ${SHOP_SUBSCRIPTION_PRICE.toLocaleString()}P).`)
    .addStringOption((o) =>
      o
        .setName("서브도메인")
        .setDescription("원하는 주소 (예: myshop → myshop.krl.kr). 영문 소문자/숫자/하이픈 3~30자")
        .setRequired(true)
    )
    .addStringOption((o) => o.setName("샵이름").setDescription("샵 이름 (나중에 바꿀 수 있어요)").setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const slug = interaction.options.getString("서브도메인", true).trim().toLowerCase();
    const shopName = interaction.options.getString("샵이름", true).trim();

    try {
      const shop = await purchaseShopSubscription({
        userId: user.id,
        slug,
        shopName,
        claimDiscordId: interaction.user.id,
      });

      const embed = successEmbed(`"${shopName}" 샵이 생성되었습니다!`)
        .setTitle("🎉 자판기 구매 완료")
        .addFields(
          { name: "주소", value: shop.url, inline: true },
          { name: "다음 결제일", value: "30일 후 (자동으로 포인트 차감)", inline: true },
          {
            name: "다음 단계",
            value:
              "1) 봇을 자신의 디스코드 서버에 초대하세요.\n" +
              `2) 그 서버에서 \`/샵연동 서브도메인:${slug}\`를 입력해 이 샵과 연결하세요.\n` +
              "3) 연결되면 그 서버에서 모든 자비샵 기능(구매/쿠폰/관리자 패널 등)을 그대로 쓸 수 있습니다.",
          }
        );
      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const message = e instanceof ShopPurchaseError || e instanceof Error ? e.message : "샵 생성 중 오류가 발생했습니다.";
      await interaction.editReply({ embeds: [errorEmbed(message)] });
    }
  },
};

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
