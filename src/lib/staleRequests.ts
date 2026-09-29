import { prisma } from "@/lib/prisma";
import { REFUND_STATUS, EXCHANGE_STATUS } from "@/lib/constants";
import { notifyAllAdmins } from "@/lib/discordNotify";

const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12시간 넘게 대기 중이면 "방치됨"으로 간주
const REMIND_INTERVAL_MS = 12 * 60 * 60 * 1000; // 해결될 때까지 12시간마다 재알림

/** 12시간 넘게 처리 안 된 환불/교환 요청이 있으면 모든 관리자에게 DM으로 알린다. */
export async function checkStaleRequests() {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_THRESHOLD_MS);
  const remindCutoff = new Date(now.getTime() - REMIND_INTERVAL_MS);

  const staleRefunds = await prisma.refundRequest.findMany({
    where: {
      status: REFUND_STATUS.PENDING,
      createdAt: { lte: staleCutoff },
      OR: [{ remindedAt: null }, { remindedAt: { lte: remindCutoff } }],
    },
    include: { user: true, order: { include: { tier: true } } },
  });
  for (const r of staleRefunds) {
    const hours = Math.floor((now.getTime() - r.createdAt.getTime()) / (60 * 60 * 1000));
    await notifyAllAdmins({
      title: "⏰ 방치된 환불 요청",
      description: `**${r.user.name}**님의 "${r.order.tier.name}" 환불 요청이 **${hours}시간째** 처리 대기 중입니다.\n사유: ${r.reason}`,
      color: 0xef4444,
      timestamp: now.toISOString(),
    });
    await prisma.refundRequest.update({ where: { id: r.id }, data: { remindedAt: now } });
  }

  const staleExchanges = await prisma.exchangeRequest.findMany({
    where: {
      status: EXCHANGE_STATUS.PENDING,
      createdAt: { lte: staleCutoff },
      OR: [{ remindedAt: null }, { remindedAt: { lte: remindCutoff } }],
    },
    include: { user: true, order: { include: { tier: true } } },
  });
  for (const r of staleExchanges) {
    const hours = Math.floor((now.getTime() - r.createdAt.getTime()) / (60 * 60 * 1000));
    await notifyAllAdmins({
      title: "⏰ 방치된 교환 요청",
      description: `**${r.user.name}**님의 "${r.order.tier.name}" 교환 요청이 **${hours}시간째** 처리 대기 중입니다.\n사유: ${r.reason}`,
      color: 0xef4444,
      timestamp: now.toISOString(),
    });
    await prisma.exchangeRequest.update({ where: { id: r.id }, data: { remindedAt: now } });
  }

  return { refunds: staleRefunds.length, exchanges: staleExchanges.length };
}
