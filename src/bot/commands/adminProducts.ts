import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed, won } from "@/bot/format";
import { tierAutocomplete } from "@/bot/autocomplete";
import type { BotCommand } from "@/bot/types";

function slugify(input: string) {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/(^-|-$)/g, "") || `tier-${Date.now()}`
  );
}

export const tierListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("등급목록").setDescription("[관리자] 전체 등급 목록을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const tiers = await prisma.tier.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { artworks: true } } },
    });
    const embed = baseEmbed("📋 등급 목록");
    for (const t of tiers) {
      embed.addFields({
        name: `${t.name} (${t.slug})`,
        value: `${won(t.price)} · ${t.minCount}~${t.maxCount}개 · 재고 ${t._count.artworks}개 · ${t.status}`,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const tierCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("등급생성")
    .setDescription("[관리자] 새 랜덤 등급 상품을 만듭니다.")
    .addStringOption((o) => o.setName("이름").setDescription("등급명").setRequired(true))
    .addIntegerOption((o) => o.setName("가격").setDescription("가격(포인트)").setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o.setName("최소계정수").setDescription("최소 계정 수").setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o.setName("최대계정수").setDescription("최대 계정 수").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("설명").setDescription("상품 설명"))
    .addIntegerOption((o) => o.setName("구매제한").setDescription("1인당 구매 제한 수량")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const name = interaction.options.getString("이름", true);
    const price = interaction.options.getInteger("가격", true);
    const minCount = interaction.options.getInteger("최소계정수", true);
    const maxCount = interaction.options.getInteger("최대계정수", true);
    const description = interaction.options.getString("설명");
    const purchaseLimitPerUser = interaction.options.getInteger("구매제한");

    if (maxCount < minCount) {
      return interaction.reply({ embeds: [errorEmbed("최대 계정 수는 최소 계정 수보다 커야 합니다.")], ephemeral: true });
    }

    let slug = slugify(name);
    if (await prisma.tier.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString().slice(-5)}`;

    const tier = await prisma.tier.create({
      data: { slug, name, price, minCount, maxCount, description, purchaseLimitPerUser },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "TIER_CREATE", target: tier.id, detail: name } });
    await interaction.reply({ embeds: [successEmbed(`"${name}" 등급이 생성되었습니다. (slug: ${slug})`)], ephemeral: true });
  },
};

export const tierUpdateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("등급수정")
    .setDescription("[관리자] 등급 정보를 수정합니다.")
    .addStringOption((o) => o.setName("등급").setDescription("수정할 등급").setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName("가격").setDescription("새 가격"))
    .addStringOption((o) =>
      o
        .setName("상태")
        .setDescription("판매 상태")
        .addChoices({ name: "판매중", value: "ON_SALE" }, { name: "숨김", value: "HIDDEN" }, { name: "품절", value: "SOLD_OUT" })
    )
    .addStringOption((o) => o.setName("설명").setDescription("새 설명"))
    .addIntegerOption((o) => o.setName("구매제한").setDescription("1인당 구매 제한 (0=무제한)")),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급", true);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 등급입니다.")], ephemeral: true });

    const price = interaction.options.getInteger("가격");
    const status = interaction.options.getString("상태");
    const description = interaction.options.getString("설명");
    const purchaseLimit = interaction.options.getInteger("구매제한");

    await prisma.tier.update({
      where: { id: tier.id },
      data: {
        ...(price != null ? { price } : {}),
        ...(status != null ? { status } : {}),
        ...(description != null ? { description } : {}),
        ...(purchaseLimit != null ? { purchaseLimitPerUser: purchaseLimit === 0 ? null : purchaseLimit } : {}),
      },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "TIER_UPDATE", target: tier.id } });
    await interaction.reply({ embeds: [successEmbed(`"${tier.name}" 등급이 수정되었습니다.`)], ephemeral: true });
  },
};

export const tierDeleteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("등급삭제")
    .setDescription("[관리자] 등급을 삭제합니다 (재고가 있으면 숨김 처리로 대체).")
    .addStringOption((o) => o.setName("등급").setDescription("삭제할 등급").setRequired(true).setAutocomplete(true)),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급", true);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 등급입니다.")], ephemeral: true });

    const artworkCount = await prisma.artwork.count({ where: { tierId: tier.id } });
    if (artworkCount > 0) {
      await prisma.tier.update({ where: { id: tier.id }, data: { status: "HIDDEN" } });
      await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "TIER_HIDE", target: tier.id, detail: "재고 있어 숨김" } });
      return interaction.reply({
        embeds: [successEmbed(`"${tier.name}" 등급은 재고(${artworkCount}개)가 있어 삭제 대신 숨김 처리했습니다.`)],
        ephemeral: true,
      });
    }

    await prisma.tier.delete({ where: { id: tier.id } });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "TIER_DELETE", target: tier.id, detail: tier.name } });
    await interaction.reply({ embeds: [successEmbed(`"${tier.name}" 등급이 삭제되었습니다.`)], ephemeral: true });
  },
};
