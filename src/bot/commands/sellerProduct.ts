import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { panelError, panelSuccess, ephemeral } from "@/bot/ui";
import { sellerProductPayload } from "@/bot/sellerPanels";
import { SELLER_STATUS } from "@/lib/constants";
import { sendChannelMessage } from "@/lib/discordNotify";
import type { BotCommand } from "@/bot/types";

export const SELLER_PRODUCT_MODAL_ID = "seller_product_modal";

async function requireOwnActiveSeller(discordUserId: string) {
  const seller = await prisma.seller.findUnique({ where: { discordUserId } });
  if (!seller) throw new Error("판매자 등록 정보가 없습니다. 먼저 판매자로 입점 신청해주세요.");
  if (seller.status !== SELLER_STATUS.ACTIVE) throw new Error("활동 중인 판매자만 상품을 등록할 수 있습니다.");
  if (!seller.channelId) throw new Error("판매자 쇼룸 채널이 없습니다. 관리자에게 문의해주세요.");
  return seller;
}

export async function showSellerProductModal(interaction: ButtonInteraction | ChatInputCommandInteraction) {
  try {
    await requireOwnActiveSeller(interaction.user.id);
  } catch (e) {
    return interaction.reply(ephemeral(panelError(e instanceof Error ? e.message : "오류가 발생했습니다.")));
  }

  const modal = new ModalBuilder().setCustomId(SELLER_PRODUCT_MODAL_ID).setTitle("상품 등록");
    const name = new TextInputBuilder().setCustomId("name").setLabel("상품명").setStyle(TextInputStyle.Short).setRequired(true);
    const price = new TextInputBuilder().setCustomId("price").setLabel("가격(원)").setStyle(TextInputStyle.Short).setRequired(true);
    const stock = new TextInputBuilder()
      .setCustomId("stock")
      .setLabel("재고 (숫자, 비우면 '문의'로 표시)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
    const description = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("상품 설명")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
    const purchaseMethod = new TextInputBuilder()
      .setCustomId("purchaseMethod")
      .setLabel("구매 방법 / 환불 안내")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(name),
    new ActionRowBuilder<TextInputBuilder>().addComponents(price),
    new ActionRowBuilder<TextInputBuilder>().addComponents(stock),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description),
    new ActionRowBuilder<TextInputBuilder>().addComponents(purchaseMethod)
  );
  await interaction.showModal(modal);
}

export const sellerProductCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("상품등록").setDescription("[판매자] 내 쇼룸 채널에 새 상품을 등록합니다."),
  async execute(interaction) {
    await showSellerProductModal(interaction);
  },
};

export async function handleSellerProductModalSubmit(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const name = interaction.fields.getTextInputValue("name").trim();
  const priceRaw = interaction.fields.getTextInputValue("price").replace(/[^0-9]/g, "");
  const stockRaw = interaction.fields.getTextInputValue("stock").replace(/[^0-9]/g, "");
  const description = interaction.fields.getTextInputValue("description").trim() || undefined;
  const purchaseMethod = interaction.fields.getTextInputValue("purchaseMethod").trim() || undefined;

  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) {
    return interaction.editReply(panelError("가격은 1 이상의 숫자로 입력해주세요."));
  }
  const stock = stockRaw ? Number(stockRaw) : null;

  let seller;
  try {
    seller = await requireOwnActiveSeller(interaction.user.id);
  } catch (e) {
    return interaction.editReply(panelError(e instanceof Error ? e.message : "오류가 발생했습니다."));
  }

  const product = await prisma.sellerProduct.create({
    data: { sellerId: seller.id, name, price, stock, description, purchaseMethod, channelId: seller.channelId },
  });

  const payload = sellerProductPayload(seller, product, stock === 0);
  await sendChannelMessage(seller.channelId!, { flags: payload.flags, components: payload.components.map((c) => c.toJSON()) });

  await interaction.editReply(panelSuccess(`"${name}" 상품이 <#${seller.channelId}> 채널에 등록되었습니다.`));
}
