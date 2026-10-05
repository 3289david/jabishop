import { prisma } from "@/lib/prisma";
import { generateOrderNo } from "@/lib/orderNo";
import { computeDiscount, maybeGrantLuckyCoupon, CouponError } from "@/lib/coupon";
import { getFlashSaleDiscount } from "@/lib/events/flashSale";
import { maybeRewardReferral } from "@/lib/events/referral";
import {
  ORDER_STATUS,
  ARTWORK_STATUS,
  POINT_TX_TYPE,
  TIER_STATUS,
  SHOP_SUBSCRIPTION_TIER_SLUG,
  getPurchaseTierDiscountPercent,
} from "@/lib/constants";
import {
  notifyPurchaseByDM,
  notifyLowStockIfNeeded,
  announcePurchaseInChannel,
  announceLuckyCouponInChannel,
  getCumulativeSpend,
  syncPurchaseTierRoles,
} from "@/lib/discordNotify";
import { provisionShop } from "@/lib/provisionShop";
import { getAppOrigin } from "@/lib/appUrl";
import type { Tier } from "@prisma/client";

export class OrderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * "자판기(샵) 통째로 구매" 등급이 항상 존재하도록 보장한다 (없으면 만들고, 있으면 그대로
 * 둔다 - 관리자가 가격/설명을 나중에 바꿔도 덮어쓰지 않음). 봇 시작 시 한 번 호출한다.
 */
export async function ensureShopSubscriptionTier() {
  const existing = await prisma.tier.findUnique({ where: { slug: SHOP_SUBSCRIPTION_TIER_SLUG } });
  if (existing) return existing;
  return prisma.tier.create({
    data: {
      slug: SHOP_SUBSCRIPTION_TIER_SLUG,
      name: "🏪 자판기(샵) 통째로 구매",
      price: 4000,
      description:
        "이 봇을 자기 디스코드 서버에 초대해서 자기 이름의 샵으로 그대로 운영합니다 (디스코드 전용 - 별도 웹사이트는 없습니다). 매달 자동으로 4,000P가 결제됩니다.",
      category: "자판기",
      status: TIER_STATUS.ON_SALE,
    },
  });
}

/**
 * "자판기(샵) 통째로 구매" 전용 분기. 일반 등급처럼 미리 채워둔 재고(Artwork)에서
 * 하나를 꺼내는 게 아니라, 구매하는 그 순간 전용 샵(전용 DB)을 직접
 * 만들어서 지급한다. DNS/nginx/프로세스 생성 같은 외부 작업은 DB 트랜잭션으로 묶을
 * 수 없어서(롤백 불가능, 오래 걸림), 포인트를 먼저 차감하고(트랜잭션) -> 외부에서
 * 실제로 만들고 -> 실패하면 포인트를 그대로 환불하는 순서로 처리한다.
 * 성공하면 그 결과(주소/웹훅 정보)를 일반 상품의 "텍스트로 지급되는 재고"와 똑같은
 * 모양(Artwork.fileKey)으로 담아서, 호출한 쪽(디스코드 임베드/DM/주문내역 등)이
 * 전혀 특별 취급하지 않아도 되게 한다.
 */
async function purchaseShopSubscriptionTier(
  userId: string,
  tier: Tier,
  opts?: { slug?: string; shopName?: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new OrderError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  if (user.points < tier.price) throw new OrderError("INSUFFICIENT_POINTS", "포인트가 부족합니다.");

  const desiredSlug = opts?.slug?.trim().toLowerCase();
  if (desiredSlug && !/^[a-z0-9-]{3,30}$/.test(desiredSlug)) {
    throw new OrderError("INVALID_SHOP_SLUG", "샵 주소는 영문 소문자/숫자/하이픈 3~30자여야 합니다.");
  }
  if (desiredSlug && (await prisma.shop.findUnique({ where: { slug: desiredSlug } }))) {
    throw new OrderError("SHOP_SLUG_TAKEN", "이미 사용 중인 샵 주소입니다. 다른 주소를 입력해주세요.");
  }

  const orderNo = await generateOrderNo();
  const order = await prisma.$transaction(async (tx) => {
    const newBalance = user.points - tier.price;
    await tx.user.update({ where: { id: userId }, data: { points: newBalance } });
    const o = await tx.order.create({
      data: {
        orderNo,
        userId,
        tierId: tier.id,
        priceAtPurchase: tier.price,
        discountAmount: 0,
        pointsUsed: tier.price,
        finalAmount: tier.price,
        status: ORDER_STATUS.RESERVED,
      },
    });
    await tx.pointTransaction.create({
      data: {
        userId,
        type: POINT_TX_TYPE.USE,
        amount: -tier.price,
        balanceAfter: newBalance,
        relatedOrderId: o.id,
        memo: `${tier.name} 구매`,
      },
    });
    return o;
  });

  // 구매 시 원하는 주소/이름을 입력하지 않았으면 자동으로 정한다 (나중에 /샵주소변경,
  // /설정수정 샵이름: 으로 언제든 바꿀 수 있다).
  const base = (user.name || "shop").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "shop";
  const slug = desiredSlug || `${base}-${Math.random().toString(36).slice(2, 6)}`;
  const shopName = opts?.shopName?.trim() || `${user.name}의 샵`;

  let shop;
  try {
    shop = await provisionShop({ slug, name: shopName, ownerUserId: userId, claimDiscordId: user.discordId ?? undefined });
  } catch (e) {
    const refundTarget = await prisma.user.findUnique({ where: { id: userId } });
    const refundedBalance = (refundTarget?.points ?? 0) + tier.price;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { points: refundedBalance } });
      await tx.pointTransaction.create({
        data: {
          userId,
          type: POINT_TX_TYPE.REFUND,
          amount: tier.price,
          balanceAfter: refundedBalance,
          relatedOrderId: order.id,
          memo: `${tier.name} 생성 실패 환불`,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: ORDER_STATUS.CANCELLED, cancelReason: "샵 생성 실패", cancelledAt: new Date() },
      });
    });
    const message = e instanceof Error ? e.message : "샵 생성 중 오류가 발생했습니다.";
    throw new OrderError("PROVISION_FAILED", message);
  }

  const now = new Date();
  const webhookUrl = `${getAppOrigin()}/api/webhooks/bank-topup/${slug}`;
  const fileKey = [
    `샵 코드: ${slug}`,
    `웹사이트 주소: ${shop.url}`,
    `다음 결제일: 30일 후 (자동 결제, 연체 시 즉시 중단)`,
    `입금 자동승인 웹훅 URL: ${webhookUrl}`,
    `입금 자동승인 비밀키: ${shop.bankWebhookSecret}`,
    ``,
    `다음 단계:`,
    `1) 봇을 본인 디스코드 서버에 초대`,
    `2) 그 서버에서 /샵연동 샵코드:${slug} 입력`,
    `3) 웹사이트 로그인을 쓰려면 /샵봇설정 으로 본인 디스코드 OAuth 앱(Client ID/Secret) 등록 (명령어 실행 시 등록할 Redirect URI도 함께 안내됨)`,
    `4) (선택) /샵주소변경 으로 웹사이트 주소를, /설정수정 샵이름: 으로 쇼핑몰 이름을 원하는 대로 변경 가능`,
  ].join("\n");

  const artwork = await prisma.artwork.create({
    data: {
      tierId: tier.id,
      code: `SHOP-${slug}`,
      title: `${shopName} (${slug})`,
      fileKey,
      status: ARTWORK_STATUS.SOLD,
      reservedOrderId: order.id,
      soldAt: now,
    },
  });

  const completedOrder = await prisma.order.update({
    where: { id: order.id },
    data: { status: ORDER_STATUS.COMPLETED, paidAt: now, drawnAt: now, completedAt: now },
    include: { artwork: true, tier: true },
  });

  await prisma.notification.create({
    data: {
      userId,
      orderId: order.id,
      type: "ORDER_COMPLETED",
      title: "자판기(샵) 생성 완료",
      message: `${slug}.krl.kr 샵이 생성되었습니다.`,
    },
  });

  return { ...completedOrder, artwork, luckyCoupon: null, referralReward: null };
}

/**
 * 랜덤 계정 구매의 핵심 로직.
 *
 * 포인트는 관리자가 계좌이체 입금을 수동 확인한 뒤에만 충전되므로(이미 확정된 잔액),
 * 구매 시점에는 결제 대기 없이 하나의 트랜잭션 안에서
 * "포인트 차감 + 재고 원자적 선점 + 판매 확정"을 함께 처리한다.
 * 트랜잭션 도중 재고가 없으면 전체가 롤백되어 포인트도 차감되지 않는다.
 * (카드/PG 등 비동기 결제를 나중에 추가하더라도, 이 함수의 원자적 선점 쿼리는 그대로 재사용 가능하다.)
 */
export async function purchaseTier(params: {
  userId: string;
  tierId: string;
  couponCode?: string;
  shopSlug?: string;
  shopName?: string;
}) {
  const { userId, tierId, couponCode, shopSlug, shopName } = params;

  const shopTierCheck = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!shopTierCheck) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 상품입니다.");
  if (shopTierCheck.slug === SHOP_SUBSCRIPTION_TIER_SLUG) {
    if (shopTierCheck.status !== TIER_STATUS.ON_SALE) {
      throw new OrderError("TIER_NOT_ON_SALE", "현재 판매 중이 아닌 상품입니다.");
    }
    const completedOrder = await purchaseShopSubscriptionTier(userId, shopTierCheck, { slug: shopSlug, shopName });
    notifyPurchaseByDM(userId, completedOrder.id).catch(() => {});
    announcePurchaseInChannel(userId, completedOrder.id).catch(() => {});
    return completedOrder;
  }

  const completedOrder = await prisma.$transaction(async (tx) => {
    const tier = await tx.tier.findUnique({ where: { id: tierId } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 상품입니다.");
    if (tier.status !== TIER_STATUS.ON_SALE)
      throw new OrderError("TIER_NOT_ON_SALE", "현재 판매 중이 아닌 상품입니다.");

    if (tier.purchaseLimitPerUser != null) {
      const purchasedCount = await tx.order.count({
        where: {
          userId,
          tierId,
          status: { notIn: [ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED] },
        },
      });
      if (purchasedCount >= tier.purchaseLimitPerUser) {
        throw new OrderError("PURCHASE_LIMIT_EXCEEDED", "구매 제한 수량을 초과했습니다.");
      }
    }

    const baseAmount = tier.price;
    let discountAmount = 0;
    let couponId: string | null = null;

    // 예전에는 쿠폰 코드를 지정하지 않으면 쓸 수 있는 쿠폰 중 가장 할인이 큰 걸 자동으로
    // 적용했는데, 사용자가 모르는 사이에 쿠폰이 소모돼서 원치 않을 때도 써버리는 문제가
    // 있었다. 이제는 항상 명시적으로 지정한 쿠폰만 적용하고, 지정하지 않으면 쿠폰 없이 구매한다.
    const effectiveCouponCode = couponCode;

    if (effectiveCouponCode) {
      const coupon = await tx.coupon.findUnique({ where: { code: effectiveCouponCode } });
      if (!coupon) throw new OrderError("INVALID_COUPON", "존재하지 않는 쿠폰입니다.");

      try {
        discountAmount = computeDiscount(coupon, baseAmount, tierId);
      } catch (e) {
        if (e instanceof CouponError) throw new OrderError("INVALID_COUPON", e.message);
        throw e;
      }

      if (coupon.usageLimitTotal != null) {
        const totalUsed = await tx.couponUsage.count({ where: { couponId: coupon.id } });
        if (totalUsed >= coupon.usageLimitTotal)
          throw new OrderError("COUPON_EXHAUSTED", "쿠폰 사용 가능 횟수를 초과했습니다.");
      }
      const usedByUser = await tx.couponUsage.count({
        where: { couponId: coupon.id, userId },
      });
      if (usedByUser >= coupon.usageLimitPerUser)
        throw new OrderError("COUPON_EXHAUSTED", "이미 사용한 쿠폰입니다.");

      couponId = coupon.id;
    }

    // 타임세일이 켜져 있고 이 등급에 진행 중인 세일이 있으면, 쿠폰 할인과 비교해 더 큰 쪽을
    // 적용한다 (중복 적용 안 함 - 타임세일이 이기면 쿠폰은 소비하지 않는다).
    const flashSale = await getFlashSaleDiscount(tx, tierId, baseAmount);
    if (flashSale && flashSale.discount > discountAmount) {
      discountAmount = flashSale.discount;
      couponId = null;
    }

    // 누적 구매금액(이 주문 이전 기준) 등급에 따른 자동 할인. 쿠폰 할인 이후 금액에 추가로 적용된다.
    const priorSpend = await tx.order.aggregate({
      where: { userId, status: ORDER_STATUS.COMPLETED },
      _sum: { finalAmount: true },
    });
    const tierDiscountPercent = getPurchaseTierDiscountPercent(priorSpend._sum.finalAmount ?? 0);
    if (tierDiscountPercent > 0) {
      const afterCoupon = baseAmount - discountAmount;
      discountAmount += Math.floor((afterCoupon * tierDiscountPercent) / 100);
    }

    const finalAmount = Math.max(baseAmount - discountAmount, 0);

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new OrderError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
    if (user.points < finalAmount)
      throw new OrderError("INSUFFICIENT_POINTS", "포인트가 부족합니다.");

    const orderNo = await generateOrderNo();

    const order = await tx.order.create({
      data: {
        orderNo,
        userId,
        tierId,
        priceAtPurchase: baseAmount,
        couponId,
        discountAmount,
        pointsUsed: finalAmount,
        finalAmount,
        status: ORDER_STATUS.RESERVED,
      },
    });

    // 원자적 재고 선점: 같은 등급 내 "판매가능" 계정 중 하나를 무작위로 골라
    // 이 주문에 즉시 귀속시킨다. WHERE 절의 status='AVAILABLE' 재확인 덕분에
    // 동시에 여러 주문이 들어와도 같은 계정이 두 번 선택될 수 없다.
    const reserved = await tx.$executeRawUnsafe(
      `UPDATE Artwork
       SET status = 'RESERVED', reservedOrderId = ?, reservedAt = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM Artwork
         WHERE tierId = ? AND status = 'AVAILABLE'
         ORDER BY RANDOM() LIMIT 1
       )
       AND status = 'AVAILABLE'`,
      order.id,
      tierId
    );

    if (reserved === 0) {
      throw new OrderError("OUT_OF_STOCK", "현재 판매 가능한 재고가 없습니다.");
    }

    const now = new Date();

    await tx.artwork.update({
      where: { reservedOrderId: order.id },
      data: { status: ARTWORK_STATUS.SOLD, soldAt: now },
    });

    const newBalance = user.points - finalAmount;
    await tx.user.update({ where: { id: userId }, data: { points: newBalance } });
    await tx.pointTransaction.create({
      data: {
        userId,
        type: POINT_TX_TYPE.USE,
        amount: -finalAmount,
        balanceAfter: newBalance,
        relatedOrderId: order.id,
        memo: `${tier.name} 구매`,
      },
    });

    if (couponId) {
      await tx.couponUsage.create({ data: { couponId, userId, orderId: order.id } });
      await tx.userCoupon
        .updateMany({ where: { userId, couponId }, data: { usedAt: now } })
        .catch(() => {});
    }

    const completedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: ORDER_STATUS.COMPLETED,
        paidAt: now,
        drawnAt: now,
        completedAt: now,
      },
      include: { artwork: true, tier: true },
    });

    await tx.notification.create({
      data: {
        userId,
        orderId: order.id,
        type: "ORDER_COMPLETED",
        title: "랜덤 계정 지급 완료",
        message: `주문 #${orderNo}의 ${tier.name} 계정이 지급되었습니다.`,
      },
    });

    const luckyCoupon = await maybeGrantLuckyCoupon(tx, userId, tier.price);
    if (luckyCoupon) {
      await tx.notification.create({
        data: {
          userId,
          type: "LUCKY_COUPON",
          title: "🎉 구매 축하 쿠폰 당첨!",
          message: `5% 할인 쿠폰(${luckyCoupon.code})이 지급되었습니다. 쿠폰함에서 확인하세요.`,
        },
      });
    }

    const referralReward = await maybeRewardReferral(tx, userId);

    return { ...completedOrder, luckyCoupon, referralReward };
  });

  // 웹/봇 어느 쪽에서 구매하든, 디스코드 계정이 연동되어 있으면 결과를 DM으로도 보낸다.
  // 실패해도(DM 차단 등) 구매 자체는 이미 완료된 상태이므로 조용히 무시한다.
  notifyPurchaseByDM(userId, completedOrder.id).catch(() => {});

  // 재고 부족/품절 임박 시 관리자에게 알림 (핵심 요구사항: 재고 부족 방지).
  prisma.artwork
    .count({ where: { tierId, status: ARTWORK_STATUS.AVAILABLE } })
    .then((remaining) => notifyLowStockIfNeeded(tierId, remaining))
    .catch(() => {});

  // 구매 로그 채널 공개 알림 + 누적 구매금액 등급 역할 동기화 (둘 다 실패해도 구매엔 영향 없음).
  announcePurchaseInChannel(userId, completedOrder.id).catch(() => {});
  if (completedOrder.luckyCoupon) {
    announceLuckyCouponInChannel(userId, completedOrder.luckyCoupon.code).catch(() => {});
  }
  (async () => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.discordId) return;
    const spend = await getCumulativeSpend(userId);
    await syncPurchaseTierRoles(user.discordId, spend);
  })().catch(() => {});

  return completedOrder;
}

/**
 * /구매의 "수량" 옵션이나 향후 수량 지정 구매 버튼처럼, 같은 등급을 여러 개 연속으로
 * 구매할 때 쓴다. purchaseTier를 수량만큼 반복 호출하되, 장바구니 결제와 동일하게
 * 중간에 하나가 실패(품절 등)해도 그 시점까지 성공한 구매는 그대로 유지하고 중단한다.
 * 쿠폰은 첫 번째 구매에만 적용한다(등급당 1개 구매에 적용되는 쿠폰을 여러 번 쓰면 안 됨).
 */
export async function purchaseTierBulk(params: {
  userId: string;
  tierId: string;
  quantity: number;
  couponCode?: string;
}) {
  const { userId, tierId, quantity, couponCode } = params;
  let successCount = 0;
  let luckyCouponCount = 0;
  let totalPaid = 0;
  let lastError: string | null = null;
  let lastOrder: Awaited<ReturnType<typeof purchaseTier>> | null = null;

  for (let i = 0; i < quantity; i++) {
    try {
      const order = await purchaseTier({ userId, tierId, couponCode: i === 0 ? couponCode : undefined });
      successCount++;
      totalPaid += order.finalAmount;
      if (order.luckyCoupon) luckyCouponCount++;
      lastOrder = order;
    } catch (e) {
      lastError = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
      break;
    }
  }

  return {
    successCount,
    luckyCouponCount,
    totalPaid,
    lastError,
    failedCount: quantity - successCount,
    lastOrder,
  };
}

/**
 * 관리자가 결제 없이 특정 회원에게 특정 등급의 계정을 하나 지급한다.
 * 구매 제한 수량은 관리자 지급이므로 적용하지 않는다. 포인트도 차감하지 않는다.
 */
export async function grantArtworkToUser(params: { tierId: string; userId: string }) {
  const { tierId, userId } = params;

  const completedOrder = await prisma.$transaction(async (tx) => {
    const tier = await tx.tier.findUnique({ where: { id: tierId } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 상품입니다.");
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new OrderError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");

    const orderNo = await generateOrderNo();
    const order = await tx.order.create({
      data: {
        orderNo,
        userId,
        tierId,
        priceAtPurchase: 0,
        discountAmount: 0,
        pointsUsed: 0,
        finalAmount: 0,
        status: ORDER_STATUS.RESERVED,
      },
    });

    // purchaseTier()와 동일한 원자적 선점 쿼리 - 동시에 다른 구매/지급이 있어도 같은 계정이 두 번 나가지 않는다.
    const reserved = await tx.$executeRawUnsafe(
      `UPDATE Artwork
       SET status = 'RESERVED', reservedOrderId = ?, reservedAt = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM Artwork
         WHERE tierId = ? AND status = 'AVAILABLE'
         ORDER BY RANDOM() LIMIT 1
       )
       AND status = 'AVAILABLE'`,
      order.id,
      tierId
    );
    if (reserved === 0) throw new OrderError("OUT_OF_STOCK", "현재 지급 가능한 재고가 없습니다.");

    const now = new Date();
    await tx.artwork.update({
      where: { reservedOrderId: order.id },
      data: { status: ARTWORK_STATUS.SOLD, soldAt: now },
    });

    const completedOrder = await tx.order.update({
      where: { id: order.id },
      data: { status: ORDER_STATUS.COMPLETED, paidAt: now, drawnAt: now, completedAt: now },
      include: { artwork: true, tier: true },
    });

    await tx.notification.create({
      data: {
        userId,
        orderId: order.id,
        type: "ADMIN_GRANT",
        title: "계정 지급 완료",
        message: `관리자에 의해 ${tier.name} 계정이 지급되었습니다.`,
      },
    });

    return completedOrder;
  });

  const dmSent = await notifyPurchaseByDM(userId, completedOrder.id, {
    title: "🎁 계정 지급 완료",
    description: `**${completedOrder.tier.name}** 계정이 관리자에 의해 지급되었습니다.`,
  }).catch(() => false);

  return { ...completedOrder, dmSent };
}

/**
 * 관리자가 한 번에 여러 개를 지급할 때 쓴다. grantArtworkToUser를 수량만큼 반복하되,
 * 구매 쪽(purchaseTierBulk)과 동일하게 중간에 재고 부족 등으로 실패해도 그때까지
 * 지급된 건 유지하고 중단한다.
 */
export async function grantArtworkToUserBulk(params: { tierId: string; userId: string; quantity: number }) {
  const { tierId, userId, quantity } = params;
  let successCount = 0;
  let dmFailCount = 0;
  let lastError: string | null = null;
  let lastOrder: Awaited<ReturnType<typeof grantArtworkToUser>> | null = null;

  for (let i = 0; i < quantity; i++) {
    try {
      const order = await grantArtworkToUser({ tierId, userId });
      successCount++;
      if (!order.dmSent) dmFailCount++;
      lastOrder = order;
    } catch (e) {
      lastError = e instanceof OrderError || e instanceof Error ? e.message : "지급 중 오류가 발생했습니다.";
      break;
    }
  }

  return {
    successCount,
    failedCount: quantity - successCount,
    dmFailCount,
    lastError,
    lastOrder,
  };
}

/**
 * 완료된 주문에 지급된 계정을 같은 등급의 다른 재고로 교환(재추첨)한다.
 * 기존 계정은 재판매 방지를 위해 재고로 복구하지 않고 EXCHANGED 상태로 남긴다.
 */
export async function exchangeOrderArtwork(orderId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { artwork: true, tier: true },
    });
    if (!order) throw new OrderError("ORDER_NOT_FOUND", "존재하지 않는 주문입니다.");
    if (order.status !== ORDER_STATUS.COMPLETED) {
      throw new OrderError("INVALID_STATUS", "완료된 주문만 교환할 수 있습니다.");
    }
    if (!order.artwork) throw new OrderError("NO_ARTWORK", "지급된 계정이 없는 주문입니다.");

    const oldArtwork = order.artwork;

    // reservedOrderId는 유니크 제약이라, 새 계정이 이 주문을 가져가려면 기존 연결을 먼저 끊어야 한다.
    // (아래에서 재고 선점이 실패하면 트랜잭션 전체가 롤백되어 이 연결도 원래대로 되돌아간다.)
    await tx.artwork.update({
      where: { id: oldArtwork.id },
      data: { status: ARTWORK_STATUS.EXCHANGED, reservedOrderId: null, reservedAt: null },
    });

    const reserved = await tx.$executeRawUnsafe(
      `UPDATE Artwork
       SET status = 'RESERVED', reservedOrderId = ?, reservedAt = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM Artwork
         WHERE tierId = ? AND status = 'AVAILABLE' AND id != ?
         ORDER BY RANDOM() LIMIT 1
       )
       AND status = 'AVAILABLE'`,
      order.id,
      order.tierId,
      oldArtwork.id
    );
    if (reserved === 0) throw new OrderError("OUT_OF_STOCK", "교환할 다른 재고가 없습니다.");

    const now = new Date();
    const newArtwork = await tx.artwork.update({
      where: { reservedOrderId: order.id },
      data: { status: ARTWORK_STATUS.SOLD, soldAt: now },
    });

    // 새로 지급된 계정은 아직 열람하지 않았으므로 다운로드 이력을 초기화한다.
    await tx.order.update({ where: { id: order.id }, data: { firstDownloadedAt: null } });

    if (order.userId) {
      await tx.notification.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          type: "ORDER_EXCHANGED",
          title: "계정 교환 완료",
          message: `주문 #${order.orderNo}의 ${order.tier.name} 계정이 새로 교환되었습니다.`,
        },
      });
    }

    return { oldArtwork, newArtwork, tierName: order.tier.name, userId: order.userId, orderNo: order.orderNo };
  });

  const dmSent = result.userId
    ? await notifyPurchaseByDM(result.userId, orderId, {
        title: "🔄 계정 교환 완료",
        description: `**${result.tierName}** 계정이 새로 교환되어 재발송되었습니다.`,
      }).catch(() => false)
    : false;

  return { ...result, dmSent };
}

export async function cancelExpiredReservations() {
  // 향후 비동기 결제 수단(카드/PG)을 추가할 경우를 대비한 예약 만료 정리 작업.
  // 현재 포인트 결제 흐름은 트랜잭션 내에서 즉시 완료되므로 만료 대상이 거의 없다.
  const expired = await prisma.order.findMany({
    where: {
      status: { in: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.RESERVED] },
      reservationExpiresAt: { lt: new Date() },
    },
  });

  for (const order of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.artwork.updateMany({
        where: { reservedOrderId: order.id },
        data: { status: ARTWORK_STATUS.AVAILABLE, reservedOrderId: null, reservedAt: null },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: ORDER_STATUS.EXPIRED, cancelReason: "예약 시간 만료" },
      });
    });
  }
  return expired.length;
}
