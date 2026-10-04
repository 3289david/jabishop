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
import { errorEmbed, successEmbed, pt } from "@/bot/format";
import { createTopUpRequest } from "@/lib/points";
import { createInquiry } from "@/lib/inquiries";
import { updatePartnerWebhook, updatePartnerPromoMessage, requestPartner, PartnerError } from "@/lib/partners";
import { linkReferral, EventError as ReferralError } from "@/lib/events/referral";
import { purchaseTierBulk, OrderError } from "@/lib/orders";
import { purchaseShopSubscription, ShopPurchaseError } from "@/lib/shopPurchase";

export const TOPUP_MODAL_ID = "topup_modal";
export const SHOP_BUY_MODAL_ID = "shop_buy_modal";
export const INQUIRY_MODAL_ID = "inquiry_modal";
export const ANSWER_MODAL_PREFIX = "answer_modal:";
export const PARTNER_WEBHOOK_MODAL_ID = "partner_webhook_modal";
export const PARTNER_APPLY_MODAL_ID = "partner_apply_modal";
export const PARTNER_PROMO_MODAL_ID = "partner_promo_modal";
export const REFERRAL_REGISTER_MODAL_ID = "referral_register_modal";
export const QUANTITY_BUY_MODAL_PREFIX = "qtybuy_modal:";

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

export async function showShopBuyModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId(SHOP_BUY_MODAL_ID).setTitle("자판기(샵) 통째로 구매");
  const slug = new TextInputBuilder()
    .setCustomId("slug")
    .setLabel("원하는 주소 (영문 소문자/숫자/하이픈, 3~30자)")
    .setPlaceholder("예: myshop -> myshop.krl.kr")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const name = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("샵 이름 (나중에 바꿀 수 있어요)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(slug),
    new ActionRowBuilder<TextInputBuilder>().addComponents(name)
  );
  await interaction.showModal(modal);
}

export async function handleShopBuyModalSubmit(interaction: ModalSubmitInteraction) {
  const slug = interaction.fields.getTextInputValue("slug").trim().toLowerCase();
  const shopName = interaction.fields.getTextInputValue("name").trim();
  await interaction.deferReply({ ephemeral: true });

  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
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
            "3) 연결되면 그 서버에서 자비샵의 모든 기능을 그대로 쓸 수 있습니다.",
        },
        {
          name: "💳 입금 자동승인 앱 설정값 (선택)",
          value:
            `서버 웹훅 URL: \`${shop.url}/api/webhooks/bank-topup\`\n` +
            `비밀키: ||${shop.bankWebhookSecret}||\n` +
            "이 값은 이 샵 전용이라 다른 샵과 안 겹칩니다. 앱 사용법은 관리자에게 안내 채널 위치를 물어보세요.",
        }
      );
    await interaction.editReply({ embeds: [embed] });
  } catch (e) {
    const message = e instanceof ShopPurchaseError || e instanceof Error ? e.message : "샵 생성 중 오류가 발생했습니다.";
    await interaction.editReply({ embeds: [errorEmbed(message)] });
  }
}

export async function showQuantityBuyModal(interaction: ButtonInteraction, slug: string) {
  const modal = new ModalBuilder().setCustomId(`${QUANTITY_BUY_MODAL_PREFIX}${slug}`).setTitle("수량 지정 구매");
  const quantity = new TextInputBuilder()
    .setCustomId("quantity")
    .setLabel("구매할 수량 (1~50)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(quantity));
  await interaction.showModal(modal);
}

export async function handleQuantityBuyModalSubmit(interaction: ModalSubmitInteraction, slug: string) {
  const quantity = Number(interaction.fields.getTextInputValue("quantity").replace(/[^0-9]/g, ""));
  await interaction.deferReply({ ephemeral: true });

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return interaction.editReply({ embeds: [errorEmbed("수량은 1~50 사이의 숫자로 입력해주세요.")] });
  }

  try {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 등급입니다.");

    const result = await purchaseTierBulk({ userId: user.id, tierId: tier.id, quantity });
    const luckyNote =
      result.luckyCouponCount > 0 ? ` 🎉 5% 할인 쿠폰 ${result.luckyCouponCount}장 당첨! 쿠폰함에서 확인하세요.` : "";

    if (result.successCount === 0) {
      return interaction.editReply({ embeds: [errorEmbed(result.lastError ?? "구매 중 오류가 발생했습니다.")] });
    }

    const embed =
      result.failedCount > 0
        ? errorEmbed(
            `${tier.name} ${result.successCount}개 구매 완료 (총 ${pt(result.totalPaid)}).${luckyNote}\n나머지 ${result.failedCount}개 실패: ${result.lastError}`
          )
        : successEmbed(
            `${tier.name} ${result.successCount}개 구매가 완료되었습니다 (총 ${pt(result.totalPaid)}).${luckyNote}\n계정은 DM 또는 /주문내역에서 확인하세요.`
          );
    await interaction.editReply({ embeds: [embed] });
  } catch (e) {
    const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
    await interaction.editReply({ embeds: [errorEmbed(message)] });
  }
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

export async function showPartnerApplyModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId(PARTNER_APPLY_MODAL_ID).setTitle("파트너 신청");
  const name = new TextInputBuilder().setCustomId("name").setLabel("서버/채널 이름").setStyle(TextInputStyle.Short).setRequired(true);
  const emoji = new TextInputBuilder()
    .setCustomId("emoji")
    .setLabel("채널명에 붙일 이모지 (비우면 기본 🤝)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("간단한 소개")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);
  const webhookUrl = new TextInputBuilder()
    .setCustomId("webhookUrl")
    .setLabel("홍보 문구를 받을 디스코드 웹훅 URL (필수)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(name),
    new ActionRowBuilder<TextInputBuilder>().addComponents(emoji),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description),
    new ActionRowBuilder<TextInputBuilder>().addComponents(webhookUrl)
  );
  await interaction.showModal(modal);
}

export async function handlePartnerApplyModalSubmit(interaction: ModalSubmitInteraction) {
  const name = interaction.fields.getTextInputValue("name").trim();
  const emoji = interaction.fields.getTextInputValue("emoji").trim() || undefined;
  const description = interaction.fields.getTextInputValue("description").trim() || undefined;
  const webhookUrl = interaction.fields.getTextInputValue("webhookUrl").trim();
  await interaction.deferReply({ ephemeral: true });

  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return interaction.editReply({
      embeds: [errorEmbed("웹훅 URL 형식이 올바르지 않습니다. https://discord.com/api/webhooks/... 형태여야 합니다.")],
    });
  }

  try {
    await requestPartner({ discordUserId: interaction.user.id, discordTag: interaction.user.tag, name, emoji, description, webhookUrl });
  } catch (e) {
    const message = e instanceof PartnerError ? e.message : "신청 중 오류가 발생했습니다.";
    return interaction.editReply({ embeds: [errorEmbed(message)] });
  }
  await interaction.editReply({ embeds: [successEmbed("파트너 신청이 접수되었습니다. 관리자 승인을 기다려주세요.")] });
}

export async function showPartnerPromoModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId(PARTNER_PROMO_MODAL_ID).setTitle("파트너 홍보 문구 등록/수정");
  const message = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("매일 1회 내 채널에 게시될 홍보 문구")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(message));
  await interaction.showModal(modal);
}

export async function handlePartnerPromoModalSubmit(interaction: ModalSubmitInteraction) {
  const message = interaction.fields.getTextInputValue("message").trim();
  await interaction.deferReply({ ephemeral: true });

  try {
    await updatePartnerPromoMessage(interaction.user.id, message);
  } catch (e) {
    const errMessage = e instanceof PartnerError ? e.message : "처리 중 오류가 발생했습니다.";
    return interaction.editReply({ embeds: [errorEmbed(errMessage)] });
  }
  await interaction.editReply({ embeds: [successEmbed("홍보 문구가 등록되었습니다. 다음 일일 발송부터 내 채널에 자동 게시됩니다.")] });
}

export async function showReferralRegisterModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId(REFERRAL_REGISTER_MODAL_ID).setTitle("친구 초대코드 등록");
  const code = new TextInputBuilder()
    .setCustomId("code")
    .setLabel("친구의 초대코드")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(code));
  await interaction.showModal(modal);
}

export async function handleReferralRegisterModalSubmit(interaction: ModalSubmitInteraction) {
  const code = interaction.fields.getTextInputValue("code").trim();
  await interaction.deferReply({ ephemeral: true });

  try {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const referrer = await linkReferral(user.id, code);
    await interaction.editReply({
      embeds: [
        successEmbed(
          `초대코드가 등록되었습니다! ${referrer.name}님에게 등록 보상 200P가 지급됐어요.\n첫 구매를 완료하면 나에게 500P, ${referrer.name}님에게 800P가 추가로 지급됩니다.`
        ),
      ],
    });
  } catch (e) {
    const message = e instanceof ReferralError ? e.message : "처리 중 오류가 발생했습니다.";
    await interaction.editReply({ embeds: [errorEmbed(message)] });
  }
}
