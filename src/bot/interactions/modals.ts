import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser, requireLinkedAdmin } from "@/bot/discordAuth";
import { pt } from "@/bot/format";
import { buildPanel, panelError, panelSuccess } from "@/bot/ui";
import { createTopUpRequest } from "@/lib/points";
import { updatePartnerWebhook, updatePartnerPromoMessage, requestPartner, PartnerError } from "@/lib/partners";
import { linkReferral, EventError as ReferralError } from "@/lib/events/referral";
import { purchaseTier, purchaseTierBulk, OrderError } from "@/lib/orders";
import { readUploadedFile, isUploadKey } from "@/bot/fileStorage";

export const TOPUP_MODAL_ID = "topup_modal";
export const ANSWER_MODAL_PREFIX = "answer_modal:";
export const PARTNER_WEBHOOK_MODAL_ID = "partner_webhook_modal";
export const PARTNER_APPLY_MODAL_ID = "partner_apply_modal";
export const PARTNER_PROMO_MODAL_ID = "partner_promo_modal";
export const REFERRAL_REGISTER_MODAL_ID = "referral_register_modal";
export const QUANTITY_BUY_MODAL_PREFIX = "qtybuy_modal:";
export const SHOP_PURCHASE_MODAL_PREFIX = "shopbuy_modal:";

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
    return interaction.editReply(panelError("1,000원 이상만 충전 신청이 가능합니다."));
  }
  if (!depositorName) return interaction.editReply(panelError("입금자명을 입력해주세요."));

  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  await createTopUpRequest(user.id, amount, depositorName);

  await interaction.editReply(
    buildPanel({
      title: "✅ 완료",
      description: "충전 신청이 접수되었습니다. 입금 확인 후 포인트가 지급됩니다.",
      fields: settings
        ? [{ name: "입금 계좌", value: `${settings.bankName} ${settings.bankAccountNumber} (예금주: ${settings.bankAccountHolder})` }]
        : undefined,
      accentColor: 0x22c55e,
    })
  );
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
  if (!inquiry) return interaction.editReply(panelError("존재하지 않는 문의입니다."));

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { answer, status: "ANSWERED", answeredByAdminId: admin.id, answeredAt: new Date() },
  });
  await prisma.notification.create({
    data: { userId: inquiry.userId, type: "INQUIRY_ANSWERED", title: "문의 답변 완료", message: `"${inquiry.title}" 문의에 답변이 등록되었습니다.` },
  });
  await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "INQUIRY_ANSWER", target: inquiryId } });
  await interaction.editReply(panelSuccess("답변이 등록되었습니다."));
}

// "자판기 통째로 구매"는 다른 등급과 똑같이 상품 목록 → "구매하기" 버튼으로 산다.
// 다만 이 상품만은 원하는 웹사이트 주소/샵 이름을 직접 정할 수 있어야 해서, 구매
// 직전에 이 모달로 입력받는다 (둘 다 비워두면 자동으로 정해짐 - src/lib/orders.ts 참고).
// 쿠폰은 모달 안에서는 텍스트로만 입력받을 수 있어(디스코드 모달은 select를 지원 안 함)
// "쿠폰함에서 선택" 경험을 주기 위해, 이 모달을 띄우기 전에 먼저 쿠폰함 select 메뉴를
// 보여주고(src/bot/interactions/buttons.ts의 startShopPurchaseFlow), 거기서 고른
// 쿠폰 코드를 이 모달의 customId에 실어서 넘긴다.
export async function showShopPurchaseModal(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  slug: string,
  couponCode: string
) {
  const modal = new ModalBuilder()
    .setCustomId(`${SHOP_PURCHASE_MODAL_PREFIX}${slug}:${couponCode}`)
    .setTitle("자판기(샵) 구매");
  const shopSlug = new TextInputBuilder()
    .setCustomId("shopSlug")
    .setLabel("원하는 웹사이트 주소 (예: myshop)")
    .setPlaceholder("비워두면 자동으로 정해집니다")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  const shopName = new TextInputBuilder()
    .setCustomId("shopName")
    .setLabel("원하는 샵 이름")
    .setPlaceholder("비워두면 자동으로 정해집니다")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(shopSlug),
    new ActionRowBuilder<TextInputBuilder>().addComponents(shopName)
  );
  await interaction.showModal(modal);
}

export async function handleShopPurchaseModalSubmit(interaction: ModalSubmitInteraction, param: string) {
  await interaction.deferReply({ ephemeral: true });
  // 샵 코드(slug)는 영문 소문자/숫자/하이픈만 쓰므로 콜론이 절대 안 들어간다 - 쿠폰
  // 코드 쪽에 콜론이 섞여 있어도 안전하게 나뉘도록 첫 콜론 기준으로만 자른다.
  const sepIndex = param.indexOf(":");
  const slug = sepIndex === -1 ? param : param.slice(0, sepIndex);
  const couponCode = sepIndex === -1 ? "" : param.slice(sepIndex + 1);
  const shopSlug = interaction.fields.getTextInputValue("shopSlug").trim() || undefined;
  const shopName = interaction.fields.getTextInputValue("shopName").trim() || undefined;

  try {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 상품입니다.");

    const order = await purchaseTier({
      userId: user.id,
      tierId: tier.id,
      shopSlug,
      shopName,
      couponCode: couponCode || undefined,
      guildId: interaction.guildId,
    });
    const artwork = order.artwork;

    const fields = [
      { name: "결제 금액", value: pt(order.finalAmount) },
      { name: "지급된 계정", value: artwork?.title ?? "-" },
    ];
    if (order.discountAmount > 0) {
      fields.push({ name: "🎟️ 쿠폰 적용", value: `-${pt(order.discountAmount)} 할인` });
    }

    const files = [];
    let imageUrl: string | undefined;
    if (artwork) {
      if (!isUploadKey(artwork.fileKey)) {
        fields.push({ name: "지급 내용", value: artwork.fileKey });
      } else {
        try {
          const buffer = await readUploadedFile(artwork.fileKey);
          const ext = artwork.fileKey.split(".").pop() || "png";
          files.push(new AttachmentBuilder(buffer, { name: `${artwork.code}.${ext}` }));
          imageUrl = `attachment://${artwork.code}.${ext}`;
        } catch {
          // 파일 누락 시 이미지 없이 결과만 표시
        }
      }
    }
    await interaction.editReply({
      ...buildPanel({ title: `✅ ${tier.name} 구매 완료! (주문 #${order.orderNo})`, fields, imageUrl, accentColor: 0x22c55e }),
      files,
    });
  } catch (e) {
    const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
    await interaction.editReply(panelError(message));
  }
}

// 수량 지정 구매도 쿠폰함에서 고른 쿠폰 코드를 이 모달의 customId에 실어서 넘긴다
// (디스코드 모달은 select 컴포넌트를 못 담아서, 쿠폰 select는 이 모달을 띄우기 전
// 단계에서 보여준다 - src/bot/interactions/buttons.ts의 startQuantityBuyFlow 참고).
export async function showQuantityBuyModal(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  slug: string,
  couponCode: string
) {
  const modal = new ModalBuilder().setCustomId(`${QUANTITY_BUY_MODAL_PREFIX}${slug}:${couponCode}`).setTitle("수량 지정 구매");
  const quantity = new TextInputBuilder()
    .setCustomId("quantity")
    .setLabel("구매할 수량 (1~50)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(quantity));
  await interaction.showModal(modal);
}

export async function handleQuantityBuyModalSubmit(interaction: ModalSubmitInteraction, param: string) {
  const sepIndex = param.indexOf(":");
  const slug = sepIndex === -1 ? param : param.slice(0, sepIndex);
  const couponCode = sepIndex === -1 ? "" : param.slice(sepIndex + 1);
  const quantity = Number(interaction.fields.getTextInputValue("quantity").replace(/[^0-9]/g, ""));
  await interaction.deferReply({ ephemeral: true });

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return interaction.editReply(panelError("수량은 1~50 사이의 숫자로 입력해주세요."));
  }

  try {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 등급입니다.");

    const result = await purchaseTierBulk({
      userId: user.id,
      tierId: tier.id,
      quantity,
      couponCode: couponCode || undefined,
      guildId: interaction.guildId,
    });
    const luckyNote =
      result.luckyCouponCount > 0 ? ` 🎉 5% 할인 쿠폰 ${result.luckyCouponCount}장 당첨! 쿠폰함에서 확인하세요.` : "";

    if (result.successCount === 0) {
      return interaction.editReply(panelError(result.lastError ?? "구매 중 오류가 발생했습니다."));
    }

    const payload =
      result.failedCount > 0
        ? buildPanel({
            title: "⚠️ 일부 구매 완료",
            description: `${tier.name} ${result.successCount}개 구매 완료 (총 ${pt(result.totalPaid)}).${luckyNote}\n나머지 ${result.failedCount}개 실패: ${result.lastError}`,
            accentColor: 0xf59e0b,
          })
        : buildPanel({
            title: "✅ 구매 완료",
            description: `${tier.name} ${result.successCount}개 구매가 완료되었습니다 (총 ${pt(result.totalPaid)}).${luckyNote}\n계정은 DM 또는 /주문내역에서 확인하세요.`,
            accentColor: 0x22c55e,
          });
    await interaction.editReply(payload);
  } catch (e) {
    const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
    await interaction.editReply(panelError(message));
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
    return interaction.editReply(panelError(message));
  }
  await interaction.editReply(panelSuccess("웹훅이 등록되었습니다. 다음 일일 발송부터 적용됩니다."));
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
    return interaction.editReply(panelError("웹훅 URL 형식이 올바르지 않습니다. https://discord.com/api/webhooks/... 형태여야 합니다."));
  }

  try {
    await requestPartner({ discordUserId: interaction.user.id, discordTag: interaction.user.tag, name, emoji, description, webhookUrl });
  } catch (e) {
    const message = e instanceof PartnerError ? e.message : "신청 중 오류가 발생했습니다.";
    return interaction.editReply(panelError(message));
  }
  await interaction.editReply(panelSuccess("파트너 신청이 접수되었습니다. 관리자 승인을 기다려주세요."));
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
    return interaction.editReply(panelError(errMessage));
  }
  await interaction.editReply(panelSuccess("홍보 문구가 등록되었습니다. 다음 일일 발송부터 내 채널에 자동 게시됩니다."));
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
    await interaction.editReply(
      panelSuccess(
        `초대코드가 등록되었습니다! ${referrer.name}님에게 등록 보상 200P가 지급됐어요.\n첫 구매를 완료하면 나에게 500P, ${referrer.name}님에게 800P가 추가로 지급됩니다.`
      )
    );
  } catch (e) {
    const message = e instanceof ReferralError ? e.message : "처리 중 오류가 발생했습니다.";
    await interaction.editReply(panelError(message));
  }
}
