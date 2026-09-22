import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser, requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { createTopUpRequest } from "@/lib/points";
import { createInquiry } from "@/lib/inquiries";
import { updatePartnerWebhook, PartnerError } from "@/lib/partners";

export const TOPUP_MODAL_ID = "topup_modal";
export const INQUIRY_MODAL_ID = "inquiry_modal";
export const ANSWER_MODAL_PREFIX = "answer_modal:";
export const PARTNER_WEBHOOK_MODAL_ID = "partner_webhook_modal";

export async function showTopUpModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId(TOPUP_MODAL_ID).setTitle("포인트 충전 신청");
  const amount = new TextInputBuilder().setCustomId("amount").setLabel("충전 금액(원)").setStyle(TextInputStyle.Short).setRequired(true);
  const name = new TextInputBuilder().setCustomId("depositorName").setLabel("입금자명").setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(amount),
    new ActionRowBuilder<TextInputBuilder>().addComponents(name)
  );
  await interaction.showModal(modal);
}

export async function handleTopUpModalSubmit(interaction: ModalSubmitInteraction) {
  const amount = Number(interaction.fields.getTextInputValue("amount").replace(/[^0-9]/g, ""));
  const depositorName = interaction.fields.getTextInputValue("depositorName").trim();
  await interaction.deferReply({ ephemeral: true });

  if (!Number.isFinite(amount) || amount < 1000) {
    return interaction.editReply({ embeds: [errorEmbed("1,000원 이상만 충전 신청이 가능합니다.")] });
  }
  if (!depositorName) return interaction.editReply({ embeds: [errorEmbed("입금자명을 입력해주세요.")] });

  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  await createTopUpRequest(user.id, amount, depositorName);

  const embed = successEmbed("충전 신청이 접수되었습니다. 입금 확인 후 포인트가 지급됩니다.");
  if (settings) {
    embed.addFields({ name: "입금 계좌", value: `${settings.bankName} ${settings.bankAccountNumber} (예금주: ${settings.bankAccountHolder})` });
  }
  await interaction.editReply({ embeds: [embed] });
}

export async function showInquiryModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId(INQUIRY_MODAL_ID).setTitle("1:1 문의하기");
  const title = new TextInputBuilder().setCustomId("title").setLabel("제목").setStyle(TextInputStyle.Short).setRequired(true);
  const content = new TextInputBuilder().setCustomId("content").setLabel("내용").setStyle(TextInputStyle.Paragraph).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(title),
    new ActionRowBuilder<TextInputBuilder>().addComponents(content)
  );
  await interaction.showModal(modal);
}

export async function handleInquiryModalSubmit(interaction: ModalSubmitInteraction) {
  const title = interaction.fields.getTextInputValue("title").trim();
  const content = interaction.fields.getTextInputValue("content").trim();
  await interaction.deferReply({ ephemeral: true });

  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const inquiry = await createInquiry(user.id, title, content);
  await interaction.editReply({ embeds: [successEmbed(`문의가 등록되었습니다. (ID: ${inquiry.id.slice(-8)})`)] });
}

export async function showAnswerModal(interaction: ButtonInteraction, inquiryId: string) {
  const modal = new ModalBuilder().setCustomId(`${ANSWER_MODAL_PREFIX}${inquiryId}`).setTitle("문의 답변");
  const answer = new TextInputBuilder().setCustomId("answer").setLabel("답변 내용").setStyle(TextInputStyle.Paragraph).setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(answer));
  await interaction.showModal(modal);
}

export async function handleAnswerModalSubmit(interaction: ModalSubmitInteraction, inquiryId: string) {
  const answer = interaction.fields.getTextInputValue("answer").trim();
  await interaction.deferReply({ ephemeral: true });

  const admin = await requireLinkedAdmin(interaction.user.id);
  const inquiry = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) return interaction.editReply({ embeds: [errorEmbed("존재하지 않는 문의입니다.")] });

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { answer, status: "ANSWERED", answeredByAdminId: admin.id, answeredAt: new Date() },
  });
  await prisma.notification.create({
    data: { userId: inquiry.userId, type: "INQUIRY_ANSWERED", title: "문의 답변 완료", message: `"${inquiry.title}" 문의에 답변이 등록되었습니다.` },
  });
  await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "INQUIRY_ANSWER", target: inquiryId } });
  await interaction.editReply({ embeds: [successEmbed("답변이 등록되었습니다.")] });
}

export async function showPartnerWebhookModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId(PARTNER_WEBHOOK_MODAL_ID).setTitle("파트너 웹훅 등록/수정");
  const webhookUrl = new TextInputBuilder()
    .setCustomId("webhookUrl")
    .setLabel("디스코드 웹훅 URL")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(webhookUrl));
  await interaction.showModal(modal);
}

export async function handlePartnerWebhookModalSubmit(interaction: ModalSubmitInteraction) {
  const webhookUrl = interaction.fields.getTextInputValue("webhookUrl").trim();
  await interaction.deferReply({ ephemeral: true });

  try {
    await updatePartnerWebhook(interaction.user.id, webhookUrl);
  } catch (e) {
    const message = e instanceof PartnerError ? e.message : "처리 중 오류가 발생했습니다.";
    return interaction.editReply({ embeds: [errorEmbed(message)] });
  }
  await interaction.editReply({ embeds: [successEmbed("웹훅이 등록되었습니다. 다음 일일 발송부터 적용됩니다.")] });
}
