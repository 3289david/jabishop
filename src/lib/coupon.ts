import type { Coupon, Prisma } from "@prisma/client";

export class CouponError extends Error {}

export function computeDiscount(coupon: Coupon, baseAmount: number, tierId: string): number {
  const now = new Date();
  if (!coupon.active) throw new CouponError("사용할 수 없는 쿠폰입니다.");
  if (now < coupon.validFrom || now > coupon.validTo)
    throw new CouponError("쿠폰 유효기간이 아닙니다.");
  if (baseAmount < coupon.minOrderAmount)
    throw new CouponError(`최소 주문 금액 ${coupon.minOrderAmount.toLocaleString()}원 이상부터 사용 가능합니다.`);

  if (coupon.applicableTierIds) {
    try {
      const ids: string[] = JSON.parse(coupon.applicableTierIds);
      if (ids.length > 0 && !ids.includes(tierId)) {
        throw new CouponError("해당 상품에는 사용할 수 없는 쿠폰입니다.");
      }
    } catch {
      // 파싱 실패 시 제한 없음으로 간주
    }
  }

  let discount =
    coupon.discountType === "RATE"
      ? Math.floor((baseAmount * coupon.discountValue) / 100)
      : coupon.discountValue;

  if (coupon.maxDiscountAmount != null) {
    discount = Math.min(discount, coupon.maxDiscountAmount);
  }
  return Math.min(discount, baseAmount);
}

/**
 * 구매 시 쿠폰 코드를 직접 입력하지 않아도, 보유한(UserCoupon) 미사용 쿠폰 중 이 등급에
 * 지금 적용 가능한 것을 자동으로 찾아 가장 할인액이 큰 쿠폰을 골라준다. 없으면 null.
 * "구매하기" 버튼/장바구니 결제처럼 쿠폰 코드를 입력할 UI가 없는 자동화된 구매 경로에서 쓴다.
 */
export async function findBestAutoCoupon(
  tx: Prisma.TransactionClient,
  userId: string,
  tierId: string,
  baseAmount: number
): Promise<Coupon | null> {
  const userCoupons = await tx.userCoupon.findMany({
    where: { userId, usedAt: null },
    include: { coupon: true },
  });
  if (userCoupons.length === 0) return null;

  let best: { coupon: Coupon; discount: number } | null = null;
  for (const uc of userCoupons) {
    const coupon = uc.coupon;
    let discount: number;
    try {
      discount = computeDiscount(coupon, baseAmount, tierId);
    } catch {
      continue; // 이 쿠폰은 지금 조건에 안 맞음 - 다음 쿠폰 확인
    }

    if (coupon.usageLimitTotal != null) {
      const totalUsed = await tx.couponUsage.count({ where: { couponId: coupon.id } });
      if (totalUsed >= coupon.usageLimitTotal) continue;
    }

    if (!best || discount > best.discount) best = { coupon, discount };
  }

  return best?.coupon ?? null;
}
