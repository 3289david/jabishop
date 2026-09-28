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
 * 구매 시 쿠폰 코드를 직접 입력하지 않아도, 지금 이 사용자가 쓸 수 있는 쿠폰(개인 발급된
 * UserCoupon뿐 아니라, 아직 이 사용자가 안 쓴 활성 상태의 공개 코드 쿠폰까지 전부) 중
 * 이 등급에 적용 가능한 것을 자동으로 찾아 가장 할인액이 큰 쿠폰을 골라준다. 없으면 null.
 * (/구매의 쿠폰코드 옵션처럼 코드를 직접 입력해서 쓸 수 있는 쿠폰은 모두 여기서도 자동으로
 * 후보가 된다 - 개인에게 발급된 쿠폰만 보면 실제로 존재하는 쿠폰 대부분을 놓치게 된다.)
 * "구매하기" 버튼/장바구니 결제처럼 쿠폰 코드를 입력할 UI가 없는 자동화된 구매 경로에서 쓴다.
 */
export async function findBestAutoCoupon(
  tx: Prisma.TransactionClient,
  userId: string,
  tierId: string,
  baseAmount: number
): Promise<Coupon | null> {
  const now = new Date();
  const candidates = await tx.coupon.findMany({
    where: { active: true, validFrom: { lte: now }, validTo: { gte: now } },
  });
  if (candidates.length === 0) return null;

  let best: { coupon: Coupon; discount: number } | null = null;
  for (const coupon of candidates) {
    let discount: number;
    try {
      discount = computeDiscount(coupon, baseAmount, tierId);
    } catch {
      continue; // 이 쿠폰은 지금 조건에 안 맞음 - 다음 쿠폰 확인
    }

    const usedByUser = await tx.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (usedByUser >= coupon.usageLimitPerUser) continue;

    if (coupon.usageLimitTotal != null) {
      const totalUsed = await tx.couponUsage.count({ where: { couponId: coupon.id } });
      if (totalUsed >= coupon.usageLimitTotal) continue;
    }

    if (!best || discount > best.discount) best = { coupon, discount };
  }

  return best?.coupon ?? null;
}

const LUCKY_COUPON_CHANCE = 0.05; // 5% 확률
const LUCKY_COUPON_DISCOUNT_PERCENT = 10; // 10% 할인
const LUCKY_COUPON_VALID_DAYS = 7;

function generateLuckyCouponCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LUCKY${random}`;
}

/**
 * 관리자가 ShopSetting.purchaseCouponDropEnabled를 켜두면, 구매가 완료될 때마다 5% 확률로
 * 구매자에게 10% 할인 쿠폰(1회용, 7일간 유효)을 즉시 발급한다. 안 당첨되거나 기능이
 * 꺼져있으면 null. 구매 트랜잭션 안에서 호출해 주문 완료와 원자적으로 묶는다.
 */
export async function maybeGrantLuckyCoupon(tx: Prisma.TransactionClient, userId: string): Promise<Coupon | null> {
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
