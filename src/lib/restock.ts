import { prisma } from "@/lib/prisma";
import { ARTWORK_STATUS } from "@/lib/constants";
import { sendDiscordDM } from "@/lib/discordNotify";

export class RestockError extends Error {}

export async function subscribeRestock(userId: string, tierId: string) {
  const tier = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!tier) throw new RestockError("존재하지 않는 등급입니다.");

  const stock = await prisma.artwork.count({ where: { tierId, status: ARTWORK_STATUS.AVAILABLE } });
  if (stock > 0) throw new RestockError("이미 재고가 있는 상품입니다.");

  await prisma.restockSubscription.upsert({
    where: { userId_tierId: { userId, tierId } },
    update: {},
    create: { userId, tierId },
  });
}

/** 주기적으로 호출한다 - 재고가 다시 생긴 등급의 구독자 전원에게 알리고 구독을 지운다. */
export async function checkRestockSubscriptions() {
  const rows = await prisma.restockSubscription.findMany({ distinct: ["tierId"], select: { tierId: true } });

  for (const { tierId } of rows) {
    const stock = await prisma.artwork.count({ where: { tierId, status: ARTWORK_STATUS.AVAILABLE } });
    if (stock <= 0) continue;

    const tier = await prisma.tier.findUnique({ where: { id: tierId } });
    if (!tier) continue;

    const subs = await prisma.restockSubscription.findMany({ where: { tierId }, include: { user: true } });
    for (const sub of subs) {
      await prisma.notification.create({
        data: {
          userId: sub.userId,
          type: "RESTOCK",
          title: "🔔 재입고 알림",
          message: `"${tier.name}" 상품이 재입고됐어요! 지금 구매 가능합니다.`,
        },
      });
      if (sub.user.discordId) {
        sendDiscordDM(sub.user.discordId, {
          embeds: [
            {
              title: "🔔 재입고 알림",
              description: `"${tier.name}" 상품이 재입고됐어요! 지금 구매 가능합니다.`,
              color: 0x6366f1,
              timestamp: new Date().toISOString(),
            },
          ],
        }).catch(() => {});
      }
    }

    await prisma.restockSubscription.deleteMany({ where: { tierId } });
  }
}
