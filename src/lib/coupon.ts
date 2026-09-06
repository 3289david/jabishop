import type { Coupon } from "@prisma/client";

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
