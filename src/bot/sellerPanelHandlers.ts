import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { prisma } from "@/lib/prisma";
import { errorEmbed, successEmbed } from "@/bot/format";
import {
  sellerProductListEmbed,
  sellerProductToggleSelectRow,
  sellerTicketListEmbed,
} from "@/bot/sellerPanels";
import { SELLER_TICKET_STATUS } from "@/lib/constants";

async function requireOwnSeller(discordUserId: string) {
  const seller = await prisma.seller.findUnique({ where: { discordUserId } });
  if (!seller) throw new Error("판매자 등록 정보가 없습니다.");
  return seller;
}

export async function handleSellerPanelProducts(interaction: ButtonInteraction) {
  try {
    const seller = await requireOwnSeller(interaction.user.id);
    const products = await prisma.sellerProduct.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    const row = sellerProductToggleSelectRow(products);
    await interaction.reply({
      embeds: [sellerProductListEmbed(products)],
      components: row ? [row] : [],
      ephemeral: true,
    });
  } catch (e) {
    await interaction.reply({ embeds: [errorEmbed(e instanceof Error ? e.message : "오류가 발생했습니다.")], ephemeral: true });
  }
}

export async function handleSellerPanelTickets(interaction: ButtonInteraction) {
  try {
    const seller = await requireOwnSeller(interaction.user.id);
    const tickets = await prisma.sellerTicket.findMany({
      where: { sellerId: seller.id, status: { notIn: [SELLER_TICKET_STATUS.CLOSED, SELLER_TICKET_STATUS.CANCELLED] } },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    await interaction.reply({ embeds: [sellerTicketListEmbed(tickets)], ephemeral: true });
  } catch (e) {
    await interaction.reply({ embeds: [errorEmbed(e instanceof Error ? e.message : "오류가 발생했습니다.")], ephemeral: true });
  }
}

export async function handleSellerProductToggleSelect(interaction: StringSelectMenuInteraction) {
  await interaction.deferUpdate();
  const productId = interaction.values[0];
  const product = await prisma.sellerProduct.findUnique({ where: { id: productId }, include: { seller: true } });
  if (!product || product.seller.discordUserId !== interaction.user.id) {
    return interaction.followUp({ embeds: [errorEmbed("본인 상품만 변경할 수 있습니다.")], ephemeral: true });
  }
  const updated = await prisma.sellerProduct.update({ where: { id: productId }, data: { active: !product.active } });
  const products = await prisma.sellerProduct.findMany({ where: { sellerId: product.sellerId }, orderBy: { createdAt: "desc" } });
  const row = sellerProductToggleSelectRow(products);
  await interaction.editReply({ embeds: [sellerProductListEmbed(products)], components: row ? [row] : [] });
  await interaction.followUp({
    embeds: [successEmbed(`"${updated.name}" 상품을 ${updated.active ? "판매중" : "비활성"}으로 변경했습니다.`)],
    ephemeral: true,
  });
}
