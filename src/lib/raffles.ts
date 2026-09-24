import { prisma } from "@/lib/prisma";
import { RAFFLE_STATUS } from "@/lib/constants";
import { grantArtworkToUser, OrderError } from "@/lib/orders";
import { getOrCreateShopUser } from "@/bot/discordAuth";

export class RaffleError extends Error {}

export async function createRaffleEvent(params: {
  title: string;
  description?: string;
  tierId: string;
  channelId: string;
  winnerCount: number;
  closesAt?: Date;
  createdByAdminId: string;
}) {
  const { title, description, tierId, channelId, winnerCount, closesAt, createdByAdminId } = params;
  if (winnerCount < 1) throw new RaffleError("당첨자 수는 1명 이상이어야 합니다.");

  const tier = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!tier) throw new RaffleError("존재하지 않는 상품입니다.");

  return prisma.raffleEvent.create({
    data: { title, description, tierId, channelId, winnerCount, closesAt, createdByAdminId },
  });
}

export async function attachRaffleMessage(raffleId: string, messageId: string) {
  await prisma.raffleEvent.update({ where: { id: raffleId }, data: { messageId } });
}

/** 참가 시점에 이벤트가 열려있는지(마감시간이 지나지 않았는지)까지 함께 확인한다. */
export async function enterRaffle(raffleId: string, discordUserId: string, discordTag: string) {
  const raffle = await prisma.raffleEvent.findUnique({ where: { id: raffleId } });
  if (!raffle) throw new RaffleError("존재하지 않는 이벤트입니다.");
  if (raffle.status !== RAFFLE_STATUS.OPEN || (raffle.closesAt && raffle.closesAt.getTime() <= Date.now())) {
    throw new RaffleError("이미 마감된 이벤트입니다.");
  }

  const existing = await prisma.raffleEntry.findUnique({
    where: { raffleId_discordUserId: { raffleId, discordUserId } },
  });
  if (existing) throw new RaffleError("이미 참가하셨습니다.");

  await prisma.raffleEntry.create({ data: { raffleId, discordUserId, discordTag } });
  return prisma.raffleEntry.count({ where: { raffleId } });
}

function pickRandomWinners<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/** 마감 + 무작위 당첨자 추첨 + 상품 지급까지 한 번에 처리한다 (수동/자동 마감 공용). */
export async function drawRaffleWinners(raffleId: string) {
  const raffle = await prisma.raffleEvent.findUnique({ where: { id: raffleId }, include: { tier: true } });
  if (!raffle) throw new RaffleError("존재하지 않는 이벤트입니다.");
  if (raffle.status !== RAFFLE_STATUS.OPEN) throw new RaffleError("이미 마감된 이벤트입니다.");

  const entries = await prisma.raffleEntry.findMany({ where: { raffleId } });
  if (entries.length === 0) throw new RaffleError("참가자가 없어 추첨할 수 없습니다.");

  const picked = pickRandomWinners(entries, Math.min(raffle.winnerCount, entries.length));

  const winners: { discordUserId: string; discordTag: string; orderId: string | null; grantFailed: boolean }[] = [];
  for (const entry of picked) {
    let orderId: string | null = null;
    let grantFailed = false;
    try {
      const user = await getOrCreateShopUser(entry.discordUserId, entry.discordTag);
      const order = await grantArtworkToUser({ tierId: raffle.tierId, userId: user.id });
      orderId = order.id;
    } catch (e) {
      grantFailed = true;
      if (!(e instanceof OrderError)) throw e;
    }
    await prisma.raffleWinner.create({
      data: { raffleId, discordUserId: entry.discordUserId, discordTag: entry.discordTag, orderId, grantFailed },
    });
    winners.push({ discordUserId: entry.discordUserId, discordTag: entry.discordTag, orderId, grantFailed });
  }

  await prisma.raffleEvent.update({
    where: { id: raffleId },
    data: { status: RAFFLE_STATUS.DRAWN, closedAt: new Date() },
  });

  return { raffle, winners, entryCount: entries.length };
}
