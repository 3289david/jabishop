import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { purchaseTier, OrderError } from "@/lib/orders";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed, pt } from "@/bot/format";
import { tierAutocomplete } from "@/bot/autocomplete";
import type { BotCommand } from "@/bot/types";

export const cartAddCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("장바구니추가")
    .setDescription("장바구니에 상품을 담습니다.")
    .addStringOption((o) => o.setName("등급").setDescription("등급").setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName("수량").setDescription("수량 (기본 1)").setMinValue(1)),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const slug = interaction.options.getString("등급", true);
    const quantity = interaction.options.getInteger("수량") ?? 1;
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 등급입니다.")], ephemeral: true });

    await prisma.cartItem.upsert({
      where: { userId_tierId: { userId: user.id, tierId: tier.id } },
      update: { quantity: { increment: quantity } },
      create: { userId: user.id, tierId: tier.id, quantity },
    });
    await interaction.reply({ embeds: [successEmbed(`${tier.name} ${quantity}개를 장바구니에 담았습니다.`)], ephemeral: true });
  },
};

export const cartViewCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("장바구니보기").setDescription("내 장바구니를 확인합니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
    const embed = baseEmbed("🛒 내 장바구니");
    if (items.length === 0) embed.setDescription("장바구니가 비어 있습니다.");
    let total = 0;
    for (const item of items) {
      const subtotal = item.tier.price * item.quantity;
      total += subtotal;
      embed.addFields({ name: item.tier.name, value: `${item.quantity}개 × ${pt(item.tier.price)} = ${pt(subtotal)}` });
    }
    if (items.length > 0) embed.addFields({ name: "합계", value: pt(total) });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const cartRemoveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("장바구니삭제")
    .setDescription("장바구니에서 특정 등급을 제거합니다.")
    .addStringOption((o) => o.setName("등급").setDescription("등급").setRequired(true).setAutocomplete(true)),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const slug = interaction.options.getString("등급", true);
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 등급입니다.")], ephemeral: true });
    await prisma.cartItem.deleteMany({ where: { userId: user.id, tierId: tier.id } });
    await interaction.reply({ embeds: [successEmbed(`${tier.name}을(를) 장바구니에서 제거했습니다.`)], ephemeral: true });
  },
};

export const cartCheckoutCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("장바구니결제").setDescription("장바구니의 모든 상품을 포인트로 결제합니다."),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
    if (items.length === 0) return interaction.editReply({ embeds: [errorEmbed("장바구니가 비어 있습니다.")] });

    let successCount = 0;
    let firstError: string | null = null;

    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        try {
          await purchaseTier({ userId: user.id, tierId: item.tierId });
          successCount++;
          await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: { decrement: 1 } } }).catch(() => {});
        } catch (e) {
          firstError = `${item.tier.name}: ${e instanceof OrderError ? e.message : "구매 중 오류"}`;
          break;
        }
      }
      if (firstError) break;
    }
    await prisma.cartItem.deleteMany({ where: { userId: user.id, quantity: { lte: 0 } } });

    if (firstError) {
      await interaction.editReply({
        embeds: [errorEmbed(successCount > 0 ? `${successCount}건 완료 후 중단 - ${firstError}` : firstError)],
      });
      return;
    }
    await interaction.editReply({ embeds: [successEmbed(`${successCount}건 결제가 완료되었습니다. /주문내역으로 확인하세요.`)] });
  },
};
