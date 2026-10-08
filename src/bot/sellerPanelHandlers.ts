import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { errorEmbed, successEmbed } from "@/bot/format";
import {
  sellerProductListEmbed,
  sellerProductToggleSelectRow,
  sellerTicketListEmbed,
  sellerStatsEmbed,
} from "@/bot/sellerPanels";
import { SELLER_TICKET_STATUS } from "@/lib/constants";

export const SELLER_EDIT_INFO_MODAL_ID = "seller_editinfo_modal";

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

export async function handleSellerPanelStats(interaction: ButtonInteraction) {
  try {
    const seller = await requireOwnSeller(interaction.user.id);
    const embed = await sellerStatsEmbed(seller);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (e) {
    await interaction.reply({ embeds: [errorEmbed(e instanceof Error ? e.message : "오류가 발생했습니다.")], ephemeral: true });
  }
}

export async function showSellerEditInfoModal(interaction: ButtonInteraction) {
  const seller = await prisma.seller.findUnique({ where: { discordUserId: interaction.user.id } });
  if (!seller) {
    return interaction.reply({ embeds: [errorEmbed("판매자 등록 정보가 없습니다.")], ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId(SELLER_EDIT_INFO_MODAL_ID).setTitle("상점 정보 수정");
  const category = new TextInputBuilder()
    .setCustomId("category")
    .setLabel("판매 카테고리")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(seller.category ?? "");
  const saleMethod = new TextInputBuilder()
    .setCustomId("saleMethod")
    .setLabel("판매 방식")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(seller.saleMethod ?? "");
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("상점 소개")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setValue(seller.description ?? "");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(category),
    new ActionRowBuilder<TextInputBuilder>().addComponents(saleMethod),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description)
  );
  await interaction.showModal(modal);
}

export async function handleSellerEditInfoModalSubmit(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const category = interaction.fields.getTextInputValue("category").trim() || null;
  const saleMethod = interaction.fields.getTextInputValue("saleMethod").trim() || null;
  const description = interaction.fields.getTextInputValue("description").trim() || null;

  const seller = await prisma.seller.findUnique({ where: { discordUserId: interaction.user.id } });
  if (!seller) {
    return interaction.editReply({ embeds: [errorEmbed("판매자 등록 정보가 없습니다.")] });
  }
  await prisma.seller.update({ where: { id: seller.id }, data: { category, saleMethod, description } });
  await interaction.editReply({ embeds: [successEmbed("상점 정보가 수정되었습니다.")] });
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
