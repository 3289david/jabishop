import { prisma } from "@/lib/prisma";
import { ORDER_STATUS, EXCHANGE_STATUS } from "@/lib/constants";
import { notifyAdminsNewPendingItem } from "@/lib/discordNotify";
import { exchangeOrderArtwork, OrderError } from "@/lib/orders";

export class ExchangeError extends Error {}

/** 구매자가 사유 + 증빙 파일과 함께 계정 교환을 신청한다. 실제 교환은 관리자 승인 후에만 이루어진다. */
export async function requestExchange(orderId: string, userId: string, reason: string, proofFileKey: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true, tier: true } });
  if (!order || order.userId !== userId) throw new ExchangeError("주문을 찾을 수 없습니다.");
  if (order.status !== ORDER_STATUS.COMPLETED) {
    throw new ExchangeError("교환 요청이 가능한 주문 상태가 아닙니다.");
  }

  const existing = await prisma.exchangeRequest.findUnique({ where: { orderId } });
  if (existing) throw new ExchangeError("이미 교환을 요청한 주문입니다.");

  const exchange = await prisma.exchangeRequest.create({
    data: { orderId, userId, reason, proofFileKey },
  });

  notifyAdminsNewPendingItem(
    "교환 요청",
    `**${order.user?.name ?? "회원"}**: #${order.orderNo} · ${order.tier.name}\n사유: ${reason}`
  ).catch(() => {});

  return exchange;
}

/** 관리자가 교환 요청을 승인한다 - 이 시점에 실제로 같은 등급의 다른 재고로 교환된다. */
export async function approveExchange(exchangeId: string, adminId: string) {
  const exchange = await prisma.exchangeRequest.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new ExchangeError("교환 요청을 찾을 수 없습니다.");
  if (exchange.status !== EXCHANGE_STATUS.PENDING) throw new ExchangeError("이미 처리된 요청입니다.");

  let result;
  try {
    result = await exchangeOrderArtwork(exchange.orderId);
  } catch (e) {
    if (e instanceof OrderError) throw new ExchangeError(e.message);
    throw e;
  }

  await prisma.exchangeRequest.update({
    where: { id: exchangeId },
    data: { status: EXCHANGE_STATUS.APPROVED, processedByAdminId: adminId, processedAt: new Date() },
  });

  return result;
}

export async function rejectExchange(exchangeId: string, adminId: string, note?: string) {
  const exchange = await prisma.exchangeRequest.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new ExchangeError("교환 요청을 찾을 수 없습니다.");
  if (exchange.status !== EXCHANGE_STATUS.PENDING) throw new ExchangeError("이미 처리된 요청입니다.");

  await prisma.exchangeRequest.update({
    where: { id: exchangeId },
    data: { status: EXCHANGE_STATUS.REJECTED, adminNote: note, processedByAdminId: adminId, processedAt: new Date() },
  });
  await prisma.notification.create({
    data: {
      userId: exchange.userId,
      orderId: exchange.orderId,
      type: "EXCHANGE_REJECTED",
      title: "교환 거절",
      message: note ? `교환 요청이 거절되었습니다: ${note}` : "교환 요청이 거절되었습니다.",
    },
  });
}
