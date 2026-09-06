import { prisma } from "@/lib/prisma";
import { generateOrderNo } from "@/lib/orderNo";
import { computeDiscount, CouponError } from "@/lib/coupon";
import { ORDER_STATUS, ARTWORK_STATUS, POINT_TX_TYPE, TIER_STATUS } from "@/lib/constants";
import { notifyPurchaseByDM } from "@/lib/discordNotify";

export class OrderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 랜덤 그림 구매의 핵심 로직.
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

    // 원자적 재고 선점: 같은 등급 내 "판매가능" 그림 중 하나를 무작위로 골라
    // 이 주문에 즉시 귀속시킨다. WHERE 절의 status='AVAILABLE' 재확인 덕분에
    // 동시에 여러 주문이 들어와도 같은 그림이 두 번 선택될 수 없다.
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
        title: "랜덤 그림 지급 완료",
        message: `주문 #${orderNo}의 ${tier.name} 그림이 지급되었습니다.`,
      },
    });

    return completedOrder;
  });

  // 웹/봇 어느 쪽에서 구매하든, 디스코드 계정이 연동되어 있으면 결과를 DM으로도 보낸다.
  // 실패해도(DM 차단 등) 구매 자체는 이미 완료된 상태이므로 조용히 무시한다.
  notifyPurchaseByDM(userId).catch(() => {});

  return completedOrder;
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
