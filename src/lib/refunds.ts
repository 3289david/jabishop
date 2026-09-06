import { prisma } from "@/lib/prisma";
import { ORDER_STATUS, REFUND_STATUS, ARTWORK_STATUS, POINT_TX_TYPE } from "@/lib/constants";
import { notifyAdminsNewPendingItem } from "@/lib/discordNotify";

export class RefundError extends Error {}

export async function requestRefund(orderId: string, userId: string, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true, tier: true } });
  if (!order || order.userId !== userId) throw new RefundError("주문을 찾을 수 없습니다.");
  if (order.status !== ORDER_STATUS.COMPLETED)
    throw new RefundError("환불 요청이 가능한 주문 상태가 아닙니다.");

  const existing = await prisma.refundRequest.findUnique({ where: { orderId } });
  if (existing) throw new RefundError("이미 환불을 요청한 주문입니다.");

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.refundAllowedAfterDownload && order.firstDownloadedAt) {
    throw new RefundError("이미 다운로드한 상품은 환불이 불가능합니다.");
  }

  const refund = await prisma.refundRequest.create({
    data: { orderId, userId, reason },
  });

  notifyAdminsNewPendingItem(
    "환불 요청",
    `**${order.user?.name ?? "회원"}**: #${order.orderNo} · ${order.tier.name} · ${order.finalAmount.toLocaleString()}P\n사유: ${reason}`
  ).catch(() => {});

  return refund;
}

export async function approveRefund(refundId: string, adminId: string, refundAmount?: number) {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refundRequest.findUnique({
      where: { id: refundId },
      include: { order: true },
    });
    if (!refund) throw new RefundError("환불 요청을 찾을 수 없습니다.");
    if (refund.status !== REFUND_STATUS.PENDING) throw new RefundError("이미 처리된 요청입니다.");

    const amount = refundAmount ?? refund.order.finalAmount;
    const user = await tx.user.findUnique({ where: { id: refund.userId } });
    if (!user) throw new RefundError("사용자를 찾을 수 없습니다.");

    const newBalance = user.points + amount;
    await tx.user.update({ where: { id: user.id }, data: { points: newBalance } });
    await tx.pointTransaction.create({
      data: {
        userId: user.id,
        type: POINT_TX_TYPE.REFUND,
        amount,
        balanceAfter: newBalance,
        relatedOrderId: refund.orderId,
        memo: "환불 승인",
      },
    });

    await tx.order.update({
      where: { id: refund.orderId },
      data: { status: ORDER_STATUS.REFUNDED, cancelledAt: new Date(), cancelReason: "환불 완료" },
    });

    // 다운로드하지 않은 상품은 재고로 복구, 이미 열람/다운로드된 상품은 재판매하지 않는다.
    if (!refund.order.firstDownloadedAt) {
      await tx.artwork.updateMany({
        where: { reservedOrderId: refund.orderId },
        data: { status: ARTWORK_STATUS.AVAILABLE, reservedOrderId: null, reservedAt: null, soldAt: null },
      });
    }

    await tx.refundRequest.update({
      where: { id: refundId },
      data: {
        status: REFUND_STATUS.COMPLETED,
        refundAmount: amount,
        processedByAdminId: adminId,
        processedAt: new Date(),
      },
    });

    await tx.notification.create({
      data: {
        userId: user.id,
        orderId: refund.orderId,
        type: "REFUND_COMPLETED",
        title: "환불 완료",
        message: `${amount.toLocaleString()}P가 환불되었습니다.`,
      },
    });

    return { newBalance };
  });
}

export async function rejectRefund(refundId: string, adminId: string, note?: string) {
  const refund = await prisma.refundRequest.findUnique({ where: { id: refundId } });
  if (!refund) throw new RefundError("환불 요청을 찾을 수 없습니다.");
  if (refund.status !== REFUND_STATUS.PENDING) throw new RefundError("이미 처리된 요청입니다.");

  await prisma.refundRequest.update({
    where: { id: refundId },
    data: {
      status: REFUND_STATUS.REJECTED,
      adminNote: note,
      processedByAdminId: adminId,
      processedAt: new Date(),
    },
  });
  await prisma.notification.create({
    data: {
      userId: refund.userId,
      orderId: refund.orderId,
      type: "REFUND_REJECTED",
      title: "환불 거절",
      message: note ? `환불 요청이 거절되었습니다: ${note}` : "환불 요청이 거절되었습니다.",
    },
  });
}
