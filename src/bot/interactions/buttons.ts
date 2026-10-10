import {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { purchaseTier, OrderError } from "@/lib/orders";
import type { Coupon } from "@prisma/client";
import { listUsableCoupons, computeDiscount } from "@/lib/coupon";
import { confirmTopUp, rejectTopUp, TopUpError } from "@/lib/points";
import { approveRefund, rejectRefund, RefundError } from "@/lib/refunds";
import { assertActiveShopUser, requireLinkedAdmin, isDiscordGuildAdmin } from "@/bot/discordAuth";
import { handleAntiSpamLift, handleAntiSpamKick } from "@/bot/antiSpam";
import { readUploadedFile, isUploadKey } from "@/bot/fileStorage";
import { pt } from "@/bot/format";
import { buildPanel, panelError, panelSuccess, ephemeral } from "@/bot/ui";
import {
  showTopUpModal,
  showInquiryModal,
  showAnswerModal,
  showPartnerWebhookModal,
  showPartnerApplyModal,
  showPartnerPromoModal,
} from "@/bot/interactions/modals";
import {
  categorySelectPayload,
  listProductCategories,
  productSelectPayload,
  pointsPanelPayload,
  cartPanelPayload,
  ordersPanelPayload,
  couponsPanelPayload,
  pendingTopUpsPayload,
  pendingRefundsPayload,
  pendingInquiriesPayload,
  tierListPayload,
} from "@/bot/panels";
import { enterRaffle, RaffleError } from "@/lib/raffles";
import { raffleEventPayload } from "@/bot/raffleUI";
import { performCheckIn, EventError as CheckInError } from "@/lib/events/checkin";
import { getOrCreateReferralCode, EventError as ReferralError } from "@/lib/events/referral";
import { spinGacha, EventError as GachaError } from "@/lib/events/gacha";
import { showReferralRegisterModal, showQuantityBuyModal, showShopPurchaseModal } from "@/bot/interactions/modals";
import { SHOP_SUBSCRIPTION_TIER_SLUG } from "@/lib/constants";
import { subscribeRestock, RestockError } from "@/lib/restock";
import { setAdminDutyStatus, DUTY_STATUS_LABEL } from "@/lib/adminDuty";
import { updateAdminDutyPanel } from "@/bot/adminDutyPanel";
import { showSellerApplyModal } from "@/bot/commands/sellerApply";
import {
  handleSellerBuyInquiry,
  handleSellerTicketAction,
  showSellerReportModal,
  handleSellerReviewButton,
} from "@/bot/sellerTicketHandlers";
import {
  handleSellerPanelProducts,
  handleSellerPanelTickets,
  handleSellerPanelStats,
  showSellerEditInfoModal,
} from "@/bot/sellerPanelHandlers";
import { showSellerProductModal } from "@/bot/commands/sellerProduct";

async function handlePanelProducts(interaction: ButtonInteraction) {
  const categories = await listProductCategories();
  const payload = categories.length > 1 ? await categorySelectPayload() : await productSelectPayload();
  await interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}

async function handlePanelPoints(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const txs = await prisma.pointTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 });
  const payload = pointsPanelPayload(user, txs);
  await interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}

async function handlePanelCart(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
  const payload = cartPanelPayload(items, items.length > 0);
  await interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}

async function handlePanelOrders(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { tier: true, artwork: true },
  });
  const payload = ordersPanelPayload(orders);
  await interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}

async function handlePanelCoupons(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const userCoupons = await prisma.userCoupon.findMany({ where: { userId: user.id }, include: { coupon: true }, orderBy: { issuedAt: "desc" } });
  const payload = couponsPanelPayload(userCoupons);
  await interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}

async function handlePartnerManage(interaction: ButtonInteraction) {
  const partner = await prisma.partner.findUnique({ where: { discordUserId: interaction.user.id } });
  if (!partner) {
    return interaction.reply(ephemeral(panelError("아직 파트너 신청 내역이 없습니다. [🤝 파트너 신청하기] 버튼으로 먼저 신청해주세요.")));
  }

  const fields = [
    { name: "상태", value: partner.status },
    { name: "웹훅 등록 여부", value: partner.webhookUrl ? "등록됨" : "미등록" },
    { name: "채널", value: partner.channelId ? `<#${partner.channelId}>` : "-" },
    { name: "홍보 문구 등록 여부", value: partner.promoMessage ? "등록됨" : "미등록" },
  ];
  if (partner.description) fields.push({ name: "소개", value: partner.description });
  if (partner.status === "REJECTED" && partner.adminNote) fields.push({ name: "반려 사유", value: partner.adminNote });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("partner:webhook")
      .setLabel("웹훅 등록/수정")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(partner.status !== "APPROVED"),
    new ButtonBuilder()
      .setCustomId("partner:promo")
      .setLabel("홍보문구 등록/수정")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(partner.status !== "APPROVED")
  );
  await interaction.reply(ephemeral(buildPanel({ title: `${partner.emoji || "🤝"} ${partner.name}`, fields, rows: [row] })));
}

/**
 * 디스코드 모달은 select 컴포넌트를 못 담기 때문에, "쿠폰함에서 선택" 경험을 주려면
 * 모달을 띄우기 전에 먼저 쿠폰함 select 메뉴를 보여준다. 고른 쿠폰 코드는 다음
 * 단계(모달)의 customId에 실어서 넘긴다 (handleShopCouponSelect가 모달을 띄움).
 * 쓸 수 있는 쿠폰이 하나도 없으면 이 단계를 건너뛰고 바로 모달로 간다.
 */
async function startShopPurchaseFlow(interaction: ButtonInteraction, slug: string) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const tier = await prisma.tier.findUnique({ where: { slug } });
  if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 상품입니다.");

  const usable = await listUsableCoupons(user.id, tier.id, tier.price);
  if (usable.length === 0) {
    return showShopPurchaseModal(interaction, slug, "");
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`shopcoupon:${slug}`)
    .setPlaceholder("쿠폰함에서 적용할 쿠폰을 선택하세요")
    .addOptions(
      { label: "쿠폰 사용 안 함", value: "__none__" },
      ...usable.slice(0, 24).map(({ coupon, discount }) => ({
        label: `${coupon.name} (-${discount.toLocaleString()}P)`.slice(0, 100),
        value: coupon.code,
      }))
    );
  await interaction.reply({
    content: "적용할 쿠폰을 쿠폰함에서 골라주세요. 선택하면 바로 주소/이름 입력창이 뜹니다.",
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    ephemeral: true,
  });
}

/** "수량 지정 구매" 버튼도 일반 구매하기 버튼과 동일하게 쿠폰함에서 먼저 쿠폰을 고르게 한다. */
async function startQuantityBuyFlow(interaction: ButtonInteraction, slug: string) {
  try {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 등급입니다.");

    const usable = await listUsableCoupons(user.id, tier.id, tier.price);
    if (usable.length === 0) {
      return showQuantityBuyModal(interaction, slug, "");
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`qtycoupon:${slug}`)
      .setPlaceholder("쿠폰함에서 적용할 쿠폰을 선택하세요")
      .addOptions(
        { label: "쿠폰 사용 안 함", value: "__none__" },
        ...usable.slice(0, 24).map(({ coupon, discount }) => ({
          label: `${coupon.name} (-${discount.toLocaleString()}P)`.slice(0, 100),
          value: coupon.code,
        }))
      );
    await interaction.reply({
      content: "적용할 쿠폰을 쿠폰함에서 골라주세요. 선택하면 바로 수량 입력창이 뜹니다.",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
  } catch (e) {
    const message = e instanceof OrderError || e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.";
    await interaction.reply(ephemeral(panelError(message)));
  }
}

/** 수량 지정 구매 버튼에서 쿠폰함 select를 고른 뒤 수량 입력 모달을 띄운다. */
export async function handleQtyCouponSelect(interaction: StringSelectMenuInteraction, slug: string) {
  const chosen = interaction.values[0];
  const couponCode = chosen === "__none__" ? "" : chosen;
  return showQuantityBuyModal(interaction, slug, couponCode);
}

/** 실제 구매를 실행하고, 결과를 보여줄 패널/첨부파일을 만든다 (buy 버튼/쿠폰선택 공용). */
async function buildPurchaseResultPayload(
  userId: string,
  tier: { id: string; name: string },
  guildId: string | null,
  couponCode?: string
) {
  const order = await purchaseTier({ userId, tierId: tier.id, couponCode, guildId });
  const artwork = order.artwork;

  const fields = [
    { name: "결제 금액", value: pt(order.finalAmount) },
    { name: "지급된 계정", value: artwork?.title ?? "-" },
  ];
  if (order.discountAmount > 0) {
    fields.push({ name: couponCode ? "🎟️ 쿠폰 적용" : "💸 할인 적용", value: `-${pt(order.discountAmount)} 할인` });
  }
  if (order.luckyCoupon) {
    fields.push({ name: "🎉 구매 축하 쿠폰 당첨!", value: `5% 할인 쿠폰 \`${order.luckyCoupon.code}\`이 지급되었습니다.` });
  }
  if (order.referralReward) {
    fields.push({ name: "🎁 친구 초대 보상", value: `첫 구매 보상 +${pt(order.referralReward.refereeReward)}가 지급되었습니다.` });
  }
  if (order.bonusOrder?.artwork) {
    fields.push({ name: "🎁 1+1 이벤트 보너스!", value: `"${order.bonusOrder.artwork.title}" 계정을 하나 더 받았습니다 (DM으로도 전달됨).` });
  }

  const files: AttachmentBuilder[] = [];
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
  const payload = buildPanel({ title: `✅ ${tier.name} 구매 완료! (주문 #${order.orderNo})`, fields, imageUrl, accentColor: 0x22c55e });
  return { payload, files };
}

async function handleBuy(interaction: ButtonInteraction, slug: string) {
  if (slug === SHOP_SUBSCRIPTION_TIER_SLUG) {
    try {
      return await startShopPurchaseFlow(interaction, slug);
    } catch (e) {
      const message = e instanceof OrderError || e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.";
      return interaction.reply(ephemeral(panelError(message)));
    }
  }

  try {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 등급입니다.");

    // 쿠폰함에 쓸 수 있는 쿠폰이 있으면 먼저 어떤 쿠폰을 쓸지(또는 안 쓸지) 고르게 하고,
    // 없으면 예전처럼 곧바로 구매를 진행한다 (불필요한 단계 추가 안 함).
    const usable = await listUsableCoupons(user.id, tier.id, tier.price);
    if (usable.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`buycoupon:${slug}`)
        .setPlaceholder("쿠폰함에서 적용할 쿠폰을 선택하세요")
        .addOptions(
          { label: "쿠폰 사용 안 함", value: "__none__" },
          ...usable.slice(0, 24).map(({ coupon, discount }) => ({
            label: `${coupon.name} (-${discount.toLocaleString()}P)`.slice(0, 100),
            value: coupon.code,
          }))
        );
      return interaction.reply({
        content: "적용할 쿠폰을 쿠폰함에서 골라주세요.",
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();
    const { payload, files } = await buildPurchaseResultPayload(user.id, tier, interaction.guildId);
    await interaction.editReply({ ...payload, files });
  } catch (e) {
    const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(panelError(message));
    } else {
      await interaction.reply(ephemeral(panelError(message)));
    }
  }
}

/** buy 버튼에서 쿠폰함에 쓸 쿠폰이 있을 때 띄운 select 메뉴의 결과 처리. */
export async function handleBuyCouponSelect(interaction: StringSelectMenuInteraction, slug: string) {
  await interaction.deferUpdate();
  const chosen = interaction.values[0];
  const couponCode = chosen === "__none__" ? undefined : chosen;
  try {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 등급입니다.");

    const { payload, files } = await buildPurchaseResultPayload(user.id, tier, interaction.guildId, couponCode);
    // V2(IsComponentsV2) 메시지는 content 필드와 함께 쓸 수 없는데, 이 메시지는 원래
    // content가 있는(쿠폰 선택 안내 문구) 메시지를 편집하는 거라 content: "" 로 명시적으로
    // 비워줘야 한다 - null/생략은 기존 content가 남아있는 걸로 간주돼서 똑같이 거부된다
    // (라이브 테스트로 직접 확인함: MESSAGE_CANNOT_USE_LEGACY_FIELDS_WITH_COMPONENTS_V2).
    await interaction.editReply({ ...payload, content: "", files });
  } catch (e) {
    const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
    await interaction.editReply({ ...panelError(message), content: "" });
  }
}

async function handleCartAdd(interaction: ButtonInteraction, slug: string) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const tier = await prisma.tier.findUnique({ where: { slug } });
  if (!tier) return interaction.reply(ephemeral(panelError("존재하지 않는 등급입니다.")));

  await prisma.cartItem.upsert({
    where: { userId_tierId: { userId: user.id, tierId: tier.id } },
    update: { quantity: { increment: 1 } },
    create: { userId: user.id, tierId: tier.id, quantity: 1 },
  });
  await interaction.reply(ephemeral(panelSuccess(`${tier.name}을(를) 장바구니에 담았습니다.`)));
}

type CartItemWithTier = { id: string; tierId: string; quantity: number; tier: { name: string; price: number } };

async function handleCartCheckout(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
  if (items.length === 0) {
    await interaction.deferUpdate();
    return interaction.editReply(panelError("장바구니가 비어 있습니다."));
  }

  // 장바구니에 담긴 상품 중 하나라도 쓸 수 있는 쿠폰이 있으면 먼저 쿠폰함에서 고르게 한다.
  // 서로 다른 등급이 섞여 있어도 쿠폰은 한 건의 주문에만 적용되는 구조라, 고른 쿠폰은
  // 체크아웃 중 적용 가능한 첫 상품에만 적용된다.
  const seenCodes = new Set<string>();
  const usable: { coupon: Coupon; discount: number }[] = [];
  for (const item of items) {
    const forItem = await listUsableCoupons(user.id, item.tierId, item.tier.price);
    for (const u of forItem) {
      if (seenCodes.has(u.coupon.code)) continue;
      seenCodes.add(u.coupon.code);
      usable.push(u);
    }
  }

  if (usable.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("cartcoupon")
      .setPlaceholder("쿠폰함에서 적용할 쿠폰을 선택하세요")
      .addOptions(
        { label: "쿠폰 사용 안 함", value: "__none__" },
        ...usable.slice(0, 24).map(({ coupon, discount }) => ({
          label: `${coupon.name} (-${discount.toLocaleString()}P)`.slice(0, 100),
          value: coupon.code,
        }))
      );
    return interaction.reply({
      content: "적용할 쿠폰을 쿠폰함에서 골라주세요 (적용 가능한 상품 1개에만 적용됩니다).",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
  }

  await interaction.deferUpdate();
  await runCartCheckout(interaction, user.id, items);
}

/** 장바구니 체크아웃 버튼에서 쿠폰함 select를 고른 뒤 실제 체크아웃을 실행한다. */
export async function handleCartCouponSelect(interaction: StringSelectMenuInteraction) {
  await interaction.deferUpdate();
  const chosen = interaction.values[0];
  const couponCode = chosen === "__none__" ? undefined : chosen;
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
  if (items.length === 0) return interaction.editReply({ ...panelError("장바구니가 비어 있습니다."), content: "" });
  await runCartCheckout(interaction, user.id, items, couponCode);
}

async function runCartCheckout(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  userId: string,
  items: CartItemWithTier[],
  couponCode?: string
) {
  const coupon = couponCode ? await prisma.coupon.findUnique({ where: { code: couponCode } }) : null;
  let couponApplied = false;
  let successCount = 0;
  let luckyCouponCount = 0;
  const errors: string[] = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      // 고른 쿠폰이 이 상품에도 적용 가능한지 미리 확인해둔다 - 적용 안 되는
      // 상품에까지 쿠폰 코드를 억지로 넘기면 그 상품 구매 자체가 실패해버린다.
      let useCoupon: string | undefined;
      if (!couponApplied && coupon) {
        try {
          computeDiscount(coupon, item.tier.price, item.tierId);
          useCoupon = coupon.code;
        } catch {
          // 이 상품엔 못 쓰는 쿠폰 - 쿠폰 없이 구매하고, 다른 상품에서 다시 시도한다.
        }
      }
      try {
        const order = await purchaseTier({ userId, tierId: item.tierId, guildId: interaction.guildId, couponCode: useCoupon });
        if (useCoupon) couponApplied = true;
        successCount++;
        if (order.luckyCoupon) luckyCouponCount++;
        await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: { decrement: 1 } } }).catch(() => {});
      } catch (e) {
        // 이 상품은 더 못 사니(품절 등) 이 상품만 중단하고, 장바구니의 다른 상품은 계속 진행한다.
        errors.push(`${item.tier.name}: ${e instanceof OrderError ? e.message : "구매 중 오류"}`);
        break;
      }
    }
  }
  await prisma.cartItem.deleteMany({ where: { userId, quantity: { lte: 0 } } });

  const luckyNote = luckyCouponCount > 0 ? ` 🎉 5% 할인 쿠폰 ${luckyCouponCount}장 당첨! 쿠폰함에서 확인하세요.` : "";
  const couponNote = couponApplied ? " 🎟️ 쿠폰이 적용되었습니다." : "";
  const payload =
    errors.length > 0
      ? panelError(`${successCount}건 결제 완료.${luckyNote}${couponNote}\n실패: ${errors.join(" / ")}`)
      : panelSuccess(`${successCount}건 결제가 완료되었습니다. 계정은 DM 또는 /주문내역에서 확인하세요.${luckyNote}${couponNote}`);
  // handleCartCheckout(패널 버튼, content 없음)과 handleCartCouponSelect(쿠폰 선택
  // content 메시지) 양쪽에서 공용으로 쓰여서, content가 있던 경우까지 안전하게
  // 지우기 위해 항상 명시적으로 빈 문자열을 넣는다.
  await interaction.editReply({ ...payload, content: "" });
}

async function handleAdminSection(interaction: ButtonInteraction, section: string) {
  await requireLinkedAdmin(interaction.user.id);
  // 관리자 패널이 이제 채널에 고정되어 모두에게 보이는 메시지라, 여기서 editReply로
  // 원본을 고쳐버리면 다른 관리자들이 보는 패널까지 함께 바뀐다. 그래서 클릭한
  // 관리자에게만 보이는 새 ephemeral 응답으로 대신한다 (패널 자체는 그대로 유지).
  await interaction.deferReply({ ephemeral: true });

  if (section === "topups") {
    return interaction.editReply(await pendingTopUpsPayload());
  }
  if (section === "refunds") {
    return interaction.editReply(await pendingRefundsPayload());
  }
  if (section === "inquiries") {
    return interaction.editReply(await pendingInquiriesPayload());
  }
  if (section === "tiers") {
    return interaction.editReply(await tierListPayload());
  }
  if (section === "stats") {
    const { statsPayload } = await import("@/bot/commands/adminStats");
    return interaction.editReply(await statsPayload());
  }
}

async function handleTopUpAction(interaction: ButtonInteraction, action: "approve" | "reject", id: string) {
  const admin = await requireLinkedAdmin(interaction.user.id);
  try {
    if (action === "approve") await confirmTopUp(id, admin.id);
    else await rejectTopUp(id, admin.id);
  } catch (e) {
    return interaction.reply(ephemeral(panelError(e instanceof TopUpError ? e.message : "처리 중 오류")));
  }
  await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: `TOPUP_${action.toUpperCase()}`, target: id } });
  await interaction.reply(ephemeral(panelSuccess(action === "approve" ? "충전을 승인했습니다." : "충전 신청을 거절했습니다.")));
}

async function handleRefundAction(interaction: ButtonInteraction, action: "approve" | "reject", id: string) {
  const admin = await requireLinkedAdmin(interaction.user.id);
  try {
    if (action === "approve") await approveRefund(id, admin.id);
    else await rejectRefund(id, admin.id);
  } catch (e) {
    return interaction.reply(ephemeral(panelError(e instanceof RefundError ? e.message : "처리 중 오류")));
  }
  await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: `REFUND_${action.toUpperCase()}`, target: id } });
  await interaction.reply(ephemeral(panelSuccess(action === "approve" ? "환불을 승인했습니다." : "환불 요청을 거절했습니다.")));
}

async function handleRaffleEnter(interaction: ButtonInteraction, raffleId: string) {
  const guildId = interaction.guildId;
  const primaryGuild = interaction.user.primaryGuild;
  const wearingTag = !!primaryGuild?.identityEnabled && primaryGuild.identityGuildId === guildId;
  if (!wearingTag) {
    return interaction.reply(
      ephemeral(panelError("이 서버의 서버 태그를 착용해야 참가할 수 있습니다. 디스코드 프로필에서 서버 태그를 켜주세요."))
    );
  }

  let entryCount: number;
  try {
    entryCount = await enterRaffle(raffleId, interaction.user.id, interaction.user.tag);
  } catch (e) {
    const message = e instanceof RaffleError ? e.message : "참가 중 오류가 발생했습니다.";
    return interaction.reply(ephemeral(panelError(message)));
  }

  await interaction.reply(ephemeral(panelSuccess(`참가 완료! 현재 참가자 ${entryCount}명`)));

  const raffle = await prisma.raffleEvent.findUnique({ where: { id: raffleId }, include: { tier: true } });
  if (raffle?.messageId && interaction.channel && "messages" in interaction.channel) {
    const msg = await interaction.channel.messages.fetch(raffle.messageId).catch(() => null);
    if (msg) await msg.edit(raffleEventPayload(raffle, entryCount)).catch(() => {});
  }
}

async function handleEventCheckIn(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  try {
    const result = await performCheckIn(user.id);
    await interaction.reply(
      ephemeral(
        buildPanel({
          title: "✅ 완료",
          description: `출석체크 완료! +${pt(result.reward)}`,
          accentColor: 0x22c55e,
          fields: [
            { name: "연속 출석", value: `${result.streak}일차` },
            { name: "보유 포인트", value: pt(result.balance) },
          ],
        })
      )
    );
  } catch (e) {
    const message = e instanceof CheckInError ? e.message : "출석체크 중 오류가 발생했습니다.";
    await interaction.reply(ephemeral(panelError(message)));
  }
}

async function handleEventReferralCode(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  try {
    const code = await getOrCreateReferralCode(user.id);
    await interaction.reply(
      ephemeral(
        buildPanel({
          title: "🎁 내 초대코드",
          description: `\`${code}\`\n\n친구가 이 코드를 [✏️ 친구 초대코드 등록] 버튼으로 입력하면 **나는 즉시 200P**,\n친구가 첫 구매를 완료하면 **나는 800P 추가**(총 1,000P) + **친구는 500P**를 받아요!`,
        })
      )
    );
  } catch (e) {
    const message = e instanceof ReferralError ? e.message : "처리 중 오류가 발생했습니다.";
    await interaction.reply(ephemeral(panelError(message)));
  }
}

async function handleEventGacha(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  try {
    const result = await spinGacha(user.id);
    const fields = [{ name: "보유 포인트", value: pt(result.balance) }];
    if (result.couponCode) {
      fields.push({ name: "쿠폰 코드", value: `\`${result.couponCode}\` (쿠폰함에서 확인 가능)` });
    }
    const payload =
      result.prize.kind === "NONE"
        ? buildPanel({ title: "❌ 오류", description: `꽝! ${pt(result.cost)}를 소모했습니다. 다음 기회에 도전해보세요.`, accentColor: 0xef4444, fields })
        : buildPanel({ title: "✅ 완료", description: `🎉 ${result.prize.label} 당첨!`, accentColor: 0x22c55e, fields });
    await interaction.reply(ephemeral(payload));
  } catch (e) {
    const message = e instanceof GachaError ? e.message : "룰렛 진행 중 오류가 발생했습니다.";
    await interaction.reply(ephemeral(panelError(message)));
  }
}

async function handleRestockSubscribe(interaction: ButtonInteraction, slug: string) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const tier = await prisma.tier.findUnique({ where: { slug } });
  if (!tier) return interaction.reply(ephemeral(panelError("존재하지 않는 등급입니다.")));

  try {
    await subscribeRestock(user.id, tier.id);
    await interaction.reply(ephemeral(panelSuccess(`"${tier.name}" 재입고 시 알려드릴게요! 재고가 다시 생기면 DM/알림으로 바로 알려드립니다.`)));
  } catch (e) {
    const message = e instanceof RestockError ? e.message : "신청 중 오류가 발생했습니다.";
    await interaction.reply(ephemeral(panelError(message)));
  }
}

async function handleDutyStatusChange(interaction: ButtonInteraction, status: string) {
  const isAdmin = await isDiscordGuildAdmin(interaction.user.id, interaction.guildId);
  if (!isAdmin) throw new Error("관리자 역할이 있는 사람만 사용할 수 있습니다.");

  const displayName = interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.tag;
  await setAdminDutyStatus(interaction.user.id, displayName, status);
  await updateAdminDutyPanel(interaction.client);
  await interaction.reply(ephemeral(panelSuccess(`상태가 "${DUTY_STATUS_LABEL[status] ?? status}"(으)로 변경되었습니다.`)));
}

/** "인증하기" 버튼 - ShopSetting.verifyRoleId를 바로 지급한다 (외부 사이트 없이 샵마다 동작). */
async function handleVerifyClaim(interaction: ButtonInteraction) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const roleId = settings?.verifyRoleId;
  if (!roleId) {
    return interaction.reply(ephemeral(panelError("인증 역할이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.")));
  }
  if (!interaction.guild) {
    return interaction.reply(ephemeral(panelError("서버 안에서만 사용할 수 있습니다.")));
  }
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    return interaction.reply(ephemeral(panelError("회원 정보를 확인하지 못했습니다. 다시 시도해주세요.")));
  }
  if (member.roles.cache.has(roleId)) {
    return interaction.reply(ephemeral(panelSuccess("이미 인증된 상태입니다.")));
  }
  try {
    await member.roles.add(roleId);
  } catch {
    return interaction.reply(ephemeral(panelError("역할 지급에 실패했습니다 - 봇의 역할이 지급할 역할보다 위에 있는지 확인해주세요.")));
  }
  await interaction.reply(ephemeral(panelSuccess(`인증 완료! <@&${roleId}> 역할이 지급되었습니다.`)));
}

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  const [ns, a, b] = interaction.customId.split(":");

  if (ns === "panel") {
    if (a === "products") return handlePanelProducts(interaction);
    if (a === "points") return handlePanelPoints(interaction);
    if (a === "cart") return handlePanelCart(interaction);
    if (a === "orders") return handlePanelOrders(interaction);
    if (a === "coupons") return handlePanelCoupons(interaction);
    if (a === "inquiry") return showInquiryModal(interaction);
    return;
  }
  if (ns === "buy") return handleBuy(interaction, a);
  if (ns === "qtybuy") return startQuantityBuyFlow(interaction, a);
  if (ns === "dutystatus") return handleDutyStatusChange(interaction, a);
  if (ns === "restock") return handleRestockSubscribe(interaction, a);
  if (ns === "cartadd") return handleCartAdd(interaction, a);
  if (ns === "cart" && a === "checkout") return handleCartCheckout(interaction);
  if (ns === "modal" && a === "topup") return showTopUpModal(interaction);
  if (ns === "admin") return handleAdminSection(interaction, a);
  if (ns === "topup") return handleTopUpAction(interaction, a as "approve" | "reject", b);
  if (ns === "refund") return handleRefundAction(interaction, a as "approve" | "reject", b);
  if (ns === "inquiry" && a === "answer") return showAnswerModal(interaction, b);
  if (ns === "raffle" && a === "enter") return handleRaffleEnter(interaction, b);
  if (ns === "event" && a === "checkin") return handleEventCheckIn(interaction);
  if (ns === "event" && a === "gacha") return handleEventGacha(interaction);
  if (ns === "event" && a === "referral" && b === "code") return handleEventReferralCode(interaction);
  if (ns === "event" && a === "referral" && b === "register") return showReferralRegisterModal(interaction);
  if (ns === "partner" && a === "webhook") return showPartnerWebhookModal(interaction);
  if (ns === "partner" && a === "apply") return showPartnerApplyModal(interaction);
  if (ns === "partner" && a === "manage") return handlePartnerManage(interaction);
  if (ns === "partner" && a === "promo") return showPartnerPromoModal(interaction);
  if (ns === "verify" && a === "claim") return handleVerifyClaim(interaction);
  if (ns === "seller" && a === "apply") return showSellerApplyModal(interaction);
  if (ns === "seller" && a === "buy") return handleSellerBuyInquiry(interaction, b);
  if (ns === "sellerticket" && a === "report") return showSellerReportModal(interaction, b);
  if (ns === "sellerticket") return handleSellerTicketAction(interaction, a, b);
  if (ns === "sellerreview") return handleSellerReviewButton(interaction, a, b);
  if (ns === "sellerpanel" && a === "newproduct") return showSellerProductModal(interaction);
  if (ns === "sellerpanel" && a === "products") return handleSellerPanelProducts(interaction);
  if (ns === "sellerpanel" && a === "tickets") return handleSellerPanelTickets(interaction);
  if (ns === "sellerpanel" && a === "stats") return handleSellerPanelStats(interaction);
  if (ns === "sellerpanel" && a === "editinfo") return showSellerEditInfoModal(interaction);
  if (ns === "antispam" && a === "lift") return handleAntiSpamLift(interaction, b);
  if (ns === "antispam" && a === "kick") return handleAntiSpamKick(interaction, b);
}
