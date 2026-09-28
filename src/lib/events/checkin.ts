import { prisma } from "@/lib/prisma";
import { POINT_TX_TYPE } from "@/lib/constants";

export class EventError extends Error {}

const BASE_REWARD = 100;
const STREAK_BONUS_PER_DAY = 20;
const MAX_STREAK_BONUS_DAYS = 10; // 연속 10일차부터는 보너스가 더 안 늘어남 (최대 100+9*20=280P)

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isYesterday(last: Date, now: Date) {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return isSameCalendarDay(last, y);
}

/** 하루 1회 출석체크로 포인트를 지급한다. 연속 출석일수에 비례해 보너스가 붙는다. */
export async function performCheckIn(userId: string) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.checkInEventEnabled) throw new EventError("현재 출석체크 이벤트가 진행 중이지 않습니다.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new EventError("사용자를 찾을 수 없습니다.");

  const now = new Date();
  if (user.lastCheckInAt && isSameCalendarDay(user.lastCheckInAt, now)) {
    throw new EventError("오늘은 이미 출석체크를 완료했습니다.");
  }

  const streak = user.lastCheckInAt && isYesterday(user.lastCheckInAt, now) ? user.checkInStreak + 1 : 1;
  const reward = BASE_REWARD + Math.min(streak - 1, MAX_STREAK_BONUS_DAYS - 1) * STREAK_BONUS_PER_DAY;

  return prisma.$transaction(async (tx) => {
    const newBalance = user.points + reward;
    await tx.user.update({
      where: { id: userId },
      data: { points: newBalance, lastCheckInAt: now, checkInStreak: streak },
    });
    await tx.pointTransaction.create({
      data: {
        userId,
        type: POINT_TX_TYPE.EVENT_REWARD,
        amount: reward,
        balanceAfter: newBalance,
        memo: `출석체크 (연속 ${streak}일차)`,
      },
    });
    return { streak, reward, balance: newBalance };
  });
}
