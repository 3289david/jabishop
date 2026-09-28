import { prisma } from "@/lib/prisma";
import { POINT_TX_TYPE, ORDER_STATUS } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

export class EventError extends Error {}

const REFERRER_REWARD = 1000;
const REFEREE_REWARD = 500;

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** 내 초대코드를 조회하고, 없으면 새로 만든다. */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new EventError("사용자를 찾을 수 없습니다.");
  if (user.referralCode) return user.referralCode;

  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return updated.referralCode!;
    } catch {
      // 코드 충돌 시 재시도
    }
  }
  throw new EventError("초대코드 생성에 실패했습니다. 다시 시도해주세요.");
}

/** 신규 회원이 초대자의 코드를 등록한다 (구매 이력이 없는 상태에서만, 1회만 가능). */
export async function linkReferral(userId: string, code: string) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.referralEventEnabled) throw new EventError("현재 친구 초대 이벤트가 진행 중이지 않습니다.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new EventError("사용자를 찾을 수 없습니다.");
  if (user.referredByUserId) throw new EventError("이미 초대코드를 등록했습니다.");

  const purchaseCount = await prisma.order.count({ where: { userId, status: { not: ORDER_STATUS.CANCELLED } } });
  if (purchaseCount > 0) throw new EventError("이미 구매 이력이 있어 초대코드를 등록할 수 없습니다.");

  const referrer = await prisma.user.findUnique({ where: { referralCode: code.trim().toUpperCase() } });
  if (!referrer) throw new EventError("존재하지 않는 초대코드입니다.");
  if (referrer.id === userId) throw new EventError("자신의 초대코드는 등록할 수 없습니다.");

  await prisma.user.update({ where: { id: userId }, data: { referredByUserId: referrer.id } });
  return referrer;
}

/**
 * 구매 트랜잭션 안에서 호출한다. 이 주문이 유저의 "첫 완료 주문"이고, 초대한 사람이
 * 등록돼 있고 아직 보상을 안 받았다면 초대자/피초대자 둘 다에게 포인트를 지급한다.
 */
export async function maybeRewardReferral(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<{ referrerId: string; referrerReward: number; refereeReward: number } | null> {
  const settings = await tx.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.referralEventEnabled) return null;

  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user?.referredByUserId || user.referralRewardedAt) return null;

  const completedCount = await tx.order.count({ where: { userId, status: ORDER_STATUS.COMPLETED } });
  if (completedCount !== 1) return null; // 방금 그 주문이 정확히 첫 완료 주문일 때만 보상

  const referrer = await tx.user.findUnique({ where: { id: user.referredByUserId } });
  if (!referrer) return null;

  const now = new Date();

  const newRefereeBalance = user.points + REFEREE_REWARD;
  await tx.user.update({ where: { id: userId }, data: { points: newRefereeBalance, referralRewardedAt: now } });
  await tx.pointTransaction.create({
    data: {
      userId,
      type: POINT_TX_TYPE.EVENT_REWARD,
      amount: REFEREE_REWARD,
      balanceAfter: newRefereeBalance,
      memo: "친구 초대 - 가입 보상",
    },
  });

  const newReferrerBalance = referrer.points + REFERRER_REWARD;
  await tx.user.update({ where: { id: referrer.id }, data: { points: newReferrerBalance } });
  await tx.pointTransaction.create({
    data: {
      userId: referrer.id,
      type: POINT_TX_TYPE.EVENT_REWARD,
      amount: REFERRER_REWARD,
      balanceAfter: newReferrerBalance,
      memo: `친구 초대 - ${user.name}님 첫 구매 보상`,
    },
  });

  await tx.notification.create({
    data: {
      userId: referrer.id,
      type: "REFERRAL_REWARD",
      title: "🎁 친구 초대 보상 지급",
      message: `${user.name}님이 첫 구매를 완료해 ${REFERRER_REWARD}P를 받았습니다.`,
    },
  });

  return { referrerId: referrer.id, referrerReward: REFERRER_REWARD, refereeReward: REFEREE_REWARD };
}
