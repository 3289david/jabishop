import { prisma } from "@/lib/prisma";
import { POINT_TX_TYPE } from "@/lib/constants";

export class EventError extends Error {}

type GachaPrize =
  | { kind: "NONE"; label: string; weight: number }
  | { kind: "POINTS"; label: string; weight: number; amount: number }
  | { kind: "COUPON"; label: string; weight: number; percent: number };

// 가중치 합 100 = 각 항목이 그대로 당첨 확률(%)이 되도록 구성
const PRIZE_TABLE: GachaPrize[] = [
  { kind: "NONE", label: "꽝", weight: 40 },
  { kind: "POINTS", label: "50P", weight: 30, amount: 50 },
  { kind: "POINTS", label: "150P", weight: 15, amount: 150 },
  { kind: "POINTS", label: "300P", weight: 10, amount: 300 },
  { kind: "COUPON", label: "10% 할인쿠폰", weight: 5, percent: 10 },
];

function pickPrize(): GachaPrize {
  const total = PRIZE_TABLE.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const prize of PRIZE_TABLE) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  return PRIZE_TABLE[0];
}

function generateGachaCouponCode(): string {
  return `GACHA${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** 포인트를 내고 룰렛을 1회 돌린다. */
export async function spinGacha(userId: string) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.gachaEventEnabled) throw new EventError("현재 룰렛 이벤트가 진행 중이지 않습니다.");

  const cost = settings.gachaCostPoints;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new EventError("사용자를 찾을 수 없습니다.");
  if (user.points < cost) throw new EventError(`포인트가 부족합니다. (필요: ${cost}P)`);

  const prize = pickPrize();

  return prisma.$transaction(async (tx) => {
    let balance = user.points - cost;
    await tx.user.update({ where: { id: userId }, data: { points: balance } });
    await tx.pointTransaction.create({
      data: { userId, type: POINT_TX_TYPE.USE, amount: -cost, balanceAfter: balance, memo: "룰렛 이벤트 참가" },
    });

    let couponCode: string | null = null;

    if (prize.kind === "POINTS") {
      balance += prize.amount;
      await tx.user.update({ where: { id: userId }, data: { points: balance } });
      await tx.pointTransaction.create({
        data: {
          userId,
          type: POINT_TX_TYPE.EVENT_REWARD,
          amount: prize.amount,
          balanceAfter: balance,
          memo: `룰렛 당첨 - ${prize.label}`,
        },
      });
    } else if (prize.kind === "COUPON") {
      const now = new Date();
      const validTo = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const coupon = await tx.coupon.create({
        data: {
          code: generateGachaCouponCode(),
          name: "🎰 룰렛 당첨 쿠폰",
          discountType: "RATE",
          discountValue: prize.percent,
          validFrom: now,
          validTo,
          usageLimitPerUser: 1,
          usageLimitTotal: 1,
          active: true,
        },
      });
      await tx.userCoupon.create({ data: { userId, couponId: coupon.id } });
      couponCode = coupon.code;
    }

    return { prize, balance, cost, couponCode };
  });
}
