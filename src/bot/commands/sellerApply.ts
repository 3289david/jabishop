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
import { applySeller, SellerError } from "@/lib/sellers";
import { errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const SELLER_APPLY_MODAL_ID = "seller_apply_modal";

export async function showSellerApplyModal(interaction: ButtonInteraction | ChatInputCommandInteraction) {
  const modal = new ModalBuilder().setCustomId(SELLER_APPLY_MODAL_ID).setTitle("판매자 입점 신청");
  const storeName = new TextInputBuilder()
    .setCustomId("storeName")
    .setLabel("상점 이름")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const category = new TextInputBuilder()
    .setCustomId("category")
    .setLabel("판매 카테고리 (예: 게임/디지털/디자인/봇/개발/기타)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  const saleMethod = new TextInputBuilder()
    .setCustomId("saleMethod")
    .setLabel("판매 방식 (예: 계좌이체, DM 거래 등)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("상점 소개")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(storeName),
    new ActionRowBuilder<TextInputBuilder>().addComponents(category),
    new ActionRowBuilder<TextInputBuilder>().addComponents(saleMethod),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description)
  );
  await interaction.showModal(modal);
}

export async function handleSellerApplyModalSubmit(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const storeName = interaction.fields.getTextInputValue("storeName").trim();
  const category = interaction.fields.getTextInputValue("category").trim() || undefined;
  const saleMethod = interaction.fields.getTextInputValue("saleMethod").trim() || undefined;
  const description = interaction.fields.getTextInputValue("description").trim() || undefined;

  try {
    await applySeller({
      discordUserId: interaction.user.id,
      discordTag: interaction.user.tag,
      storeName,
      category,
      saleMethod,
      description,
    });
    await interaction.editReply({
      embeds: [successEmbed(`"${storeName}" 입점 신청이 접수되었습니다. 관리자 승인 후 쇼룸 채널이 생성됩니다.`)],
    });
  } catch (e) {
    const message = e instanceof SellerError ? e.message : "신청 중 오류가 발생했습니다.";
    await interaction.editReply({ embeds: [errorEmbed(message)] });
  }
}

export const sellerApplyCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("판매자신청").setDescription("서버 안에서 상품을 판매할 판매자로 입점 신청합니다."),
  async execute(interaction) {
    await showSellerApplyModal(interaction);
  },
};
