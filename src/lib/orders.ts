import { prisma } from "@/lib/prisma";
import { generateOrderNo } from "@/lib/orderNo";
import { computeDiscount, CouponError } from "@/lib/coupon";
import { ORDER_STATUS, ARTWORK_STATUS, POINT_TX_TYPE, TIER_STATUS, getPurchaseTierDiscountPercent } from "@/lib/constants";
import {
  notifyPurchaseByDM,
  notifyLowStockIfNeeded,
  announcePurchaseInChannel,
  getCumulativeSpend,
  syncPurchaseTierRoles,
} from "@/lib/discordNotify";

export class OrderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
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
}) {
  const { userId, tierId, couponCode } = params;

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

    if (couponCode) {
      const coupon = await tx.coupon.findUnique({ where: { code: couponCode } });
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

    return completedOrder;
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
  (async () => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.discordId) return;
    const spend = await getCumulativeSpend(userId);
    await syncPurchaseTierRoles(user.discordId, spend);
  })().catch(() => {});

  return completedOrder;
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

  notifyPurchaseByDM(userId, completedOrder.id, {
    title: "🎁 계정 지급 완료",
    description: `**${completedOrder.tier.name}** 계정이 관리자에 의해 지급되었습니다.`,
  }).catch(() => {});

  return completedOrder;
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

  if (result.userId) {
    notifyPurchaseByDM(result.userId, orderId, {
      title: "🔄 계정 교환 완료",
      description: `**${result.tierName}** 계정이 새로 교환되어 재발송되었습니다.`,
    }).catch(() => {});
  }

  return result;
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
