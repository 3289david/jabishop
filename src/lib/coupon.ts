import type { Coupon, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
 * 지금 이 사용자가 이 등급 구매에 쓸 수 있는 쿠폰(개인 발급된 UserCoupon뿐 아니라, 아직
 * 이 사용자가 안 쓴 활성 상태의 공개 코드 쿠폰까지 전부) 목록을 예상 할인액과 함께 돌려준다.
 * 자동으로 적용하지 않고, 구매 화면에서 사용자가 직접 골라 쓰도록(또는 안 쓰도록) 하기 위해 쓴다.
 */
export async function listUsableCoupons(
  userId: string,
  tierId: string,
  baseAmount: number
): Promise<{ coupon: Coupon; discount: number }[]> {
  const now = new Date();
  const candidates = await prisma.coupon.findMany({
    where: { active: true, validFrom: { lte: now }, validTo: { gte: now } },
    orderBy: { createdAt: "desc" },
  });
  if (candidates.length === 0) return [];

  const usable: { coupon: Coupon; discount: number }[] = [];
  for (const coupon of candidates) {
    let discount: number;
    try {
      discount = computeDiscount(coupon, baseAmount, tierId);
    } catch {
      continue; // 이 쿠폰은 지금 조건에 안 맞음 - 다음 쿠폰 확인
    }

    const usedByUser = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (usedByUser >= coupon.usageLimitPerUser) continue;

    if (coupon.usageLimitTotal != null) {
      const totalUsed = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      if (totalUsed >= coupon.usageLimitTotal) continue;
    }

    usable.push({ coupon, discount });
  }

  return usable;
}

const LUCKY_COUPON_CHANCE = 0.05; // 5% 확률
const LUCKY_COUPON_DISCOUNT_PERCENT = 5; // 5% 할인
const LUCKY_COUPON_VALID_DAYS = 7;
const LUCKY_COUPON_MIN_TIER_PRICE = 100; // 이 가격(원) 미만인 상품은 추첨 대상에서 제외

function generateLuckyCouponCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LUCKY${random}`;
}

/**
 * 관리자가 ShopSetting.purchaseCouponDropEnabled를 켜두면, 100원 이상인 상품을 구매 완료할
 * 때마다 5% 확률로 구매자에게 5% 할인 쿠폰(1회용, 7일간 유효)을 즉시 발급한다. 100원 미만
 * 상품이거나 안 당첨되거나 기능이 꺼져있으면 null. 구매 트랜잭션 안에서 호출해 주문 완료와
 * 원자적으로 묶는다.
 */
export async function maybeGrantLuckyCoupon(
  tx: Prisma.TransactionClient,
  userId: string,
  tierPrice: number
): Promise<Coupon | null> {
  if (tierPrice < LUCKY_COUPON_MIN_TIER_PRICE) return null;

  const settings = await tx.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.purchaseCouponDropEnabled) return null;
  if (Math.random() >= LUCKY_COUPON_CHANCE) return null;

  const now = new Date();
  const validTo = new Date(now.getTime() + LUCKY_COUPON_VALID_DAYS * 24 * 60 * 60 * 1000);

  const coupon = await tx.coupon.create({
    data: {
      code: generateLuckyCouponCode(),
      name: "🎉 구매 축하 쿠폰",
      discountType: "RATE",
      discountValue: LUCKY_COUPON_DISCOUNT_PERCENT,
      validFrom: now,
      validTo,
      usageLimitPerUser: 1,
      usageLimitTotal: 1,
      active: true,
    },
  });
  await tx.userCoupon.create({ data: { userId, couponId: coupon.id } });

  return coupon;
}
