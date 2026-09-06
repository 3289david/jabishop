import { prisma } from "@/lib/prisma";
import { POINT_TX_TYPE, TOPUP_STATUS } from "@/lib/constants";

export class TopUpError extends Error {}

export async function confirmTopUp(topUpId: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.pointTopUpRequest.findUnique({ where: { id: topUpId } });
    if (!req) throw new TopUpError("존재하지 않는 충전 신청입니다.");
    if (req.status !== TOPUP_STATUS.PENDING)
      throw new TopUpError("이미 처리된 신청입니다.");

    const user = await tx.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new TopUpError("사용자를 찾을 수 없습니다.");

    const newBalance = user.points + req.amount;
    await tx.user.update({ where: { id: user.id }, data: { points: newBalance } });
    await tx.pointTransaction.create({
      data: {
        userId: user.id,
        type: POINT_TX_TYPE.CHARGE,
        amount: req.amount,
        balanceAfter: newBalance,
        relatedTopUpId: req.id,
        memo: `계좌이체 충전 승인 (입금자: ${req.depositorName})`,
      },
    });
    await tx.pointTopUpRequest.update({
      where: { id: req.id },
      data: { status: TOPUP_STATUS.CONFIRMED, confirmedByAdminId: adminId, confirmedAt: new Date() },
    });
    await tx.notification.create({
      data: {
        userId: user.id,
        type: "POINT_CHARGED",
        title: "포인트 충전 완료",
        message: `${req.amount.toLocaleString()}P가 충전되었습니다.`,
      },
    });
    return { newBalance };
  });
}

export async function rejectTopUp(topUpId: string, adminId: string, note?: string) {
  const req = await prisma.pointTopUpRequest.findUnique({ where: { id: topUpId } });
  if (!req) throw new TopUpError("존재하지 않는 충전 신청입니다.");
  if (req.status !== TOPUP_STATUS.PENDING) throw new TopUpError("이미 처리된 신청입니다.");

  await prisma.pointTopUpRequest.update({
    where: { id: topUpId },
    data: {
      status: TOPUP_STATUS.REJECTED,
      confirmedByAdminId: adminId,
      confirmedAt: new Date(),
      adminNote: note,
    },
  });
  await prisma.notification.create({
    data: {
      userId: req.userId,
      type: "POINT_CHARGE_REJECTED",
      title: "포인트 충전 반려",
      message: note ? `충전 신청이 반려되었습니다: ${note}` : "충전 신청이 반려되었습니다.",
    },
  });
}

export async function adjustPoints(userId: string, amount: number, memo: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new TopUpError("사용자를 찾을 수 없습니다.");
    const newBalance = user.points + amount;
    if (newBalance < 0) throw new TopUpError("포인트 잔액이 음수가 될 수 없습니다.");
    await tx.user.update({ where: { id: userId }, data: { points: newBalance } });
    await tx.pointTransaction.create({
      data: {
        userId,
        type: POINT_TX_TYPE.ADMIN_ADJUST,
        amount,
        balanceAfter: newBalance,
        memo,
      },
    });
    return { newBalance };
  });
}
