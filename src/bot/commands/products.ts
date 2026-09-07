import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { ARTWORK_STATUS, TIER_STATUS } from "@/lib/constants";
import { baseEmbed, errorEmbed, won } from "@/bot/format";
import { tierAutocomplete } from "@/bot/autocomplete";
import type { BotCommand } from "@/bot/types";

export const productListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("상품목록").setDescription("판매 중인 랜덤 계정 등급 목록을 봅니다."),
  async execute(interaction) {
    const tiers = await prisma.tier.findMany({
      where: { status: { not: TIER_STATUS.HIDDEN } },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { artworks: { where: { status: ARTWORK_STATUS.AVAILABLE } } } } },
    });

    const embed = baseEmbed("🎨 자비샵 상품 목록");
    if (tiers.length === 0) embed.setDescription("등록된 상품이 없습니다.");
    for (const t of tiers) {
      const soldOut = t._count.artworks === 0 || t.status === TIER_STATUS.SOLD_OUT;
      embed.addFields({
        name: `${t.name}${soldOut ? " (품절)" : ""}`,
        value: `${won(t.price)} · 계정 ${t.minCount}~${t.maxCount}개  · 재고 ${t._count.artworks}개`,
      });
    }
    await interaction.reply({ embeds: [embed] });
  },
};

export const productDetailCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("상품상세")
    .setDescription("등급별 상품 상세 정보를 봅니다.")
    .addStringOption((o) =>
      o.setName("등급").setDescription("조회할 등급").setRequired(true).setAutocomplete(true)
    ),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const slug = interaction.options.getString("등급", true);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 등급입니다.")], ephemeral: true });

    const [stock, categories] = await Promise.all([
      prisma.artwork.count({ where: { tierId: tier.id, status: ARTWORK_STATUS.AVAILABLE } }),
      prisma.artwork.groupBy({
        by: ["category"],
        where: { tierId: tier.id, status: ARTWORK_STATUS.AVAILABLE },
        _count: true,
      }),
    ]);

    const embed = baseEmbed(tier.name)
      .setDescription(tier.description || null)
      .addFields(
        { name: "가격", value: won(tier.price), inline: true },
        { name: "스킨 개수", value: `${tier.minCount}~${tier.maxCount}개 `, inline: true },
        { name: "재고", value: `${stock}개`, inline: true },
        { name: "구매 제한", value: tier.purchaseLimitPerUser ? `1인 ${tier.purchaseLimitPerUser}개` : "없음", inline: true },
        {
          name: "포함 가능 카테고리",
          value: categories.length ? categories.map((c) => `${c.category}(${c._count})`).join(", ") : "-",
        }
      );
    await interaction.reply({ embeds: [embed] });
  },
};
