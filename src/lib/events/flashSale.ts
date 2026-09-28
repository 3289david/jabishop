import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export class EventError extends Error {}

export async function createFlashSale(params: {
  tierId: string;
  discountPercent: number;
  durationMinutes: number;
  adminId: string;
}) {
  const { tierId, discountPercent, durationMinutes, adminId } = params;
  if (discountPercent <= 0 || discountPercent > 100) throw new EventError("할인율은 1~100 사이여야 합니다.");
  if (durationMinutes <= 0) throw new EventError("지속시간은 1분 이상이어야 합니다.");

  const tier = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!tier) throw new EventError("존재하지 않는 등급입니다.");

  const now = new Date();
  const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  return prisma.flashSale.create({
    data: { tierId, discountPercent, startsAt: now, endsAt, createdByAdminId: adminId },
  });
}

/** 이 등급에 지금 진행 중인 타임세일을 전부 즉시 종료시킨다. */
export async function cancelFlashSale(tierId: string): Promise<number> {
  const now = new Date();
  const result = await prisma.flashSale.updateMany({
    where: { tierId, startsAt: { lte: now }, endsAt: { gt: now } },
    data: { endsAt: now },
  });
  return result.count;
}

export async function getActiveFlashSale(tierId: string) {
  const now = new Date();
  return prisma.flashSale.findFirst({
    where: { tierId, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { discountPercent: "desc" },
  });
}

/** 구매 트랜잭션 안에서 호출 - 기능이 켜져 있고 진행 중인 타임세일이 있으면 할인액을 계산해 반환한다. */
export async function getFlashSaleDiscount(
  tx: Prisma.TransactionClient,
  tierId: string,
  baseAmount: number
): Promise<{ discount: number; percent: number } | null> {
  const settings = await tx.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.flashSaleEventEnabled) return null;

  const now = new Date();
  const sale = await tx.flashSale.findFirst({
    where: { tierId, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { discountPercent: "desc" },
  });
  if (!sale) return null;

  const discount = Math.min(Math.floor((baseAmount * sale.discountPercent) / 100), baseAmount);
  return { discount, percent: sale.discountPercent };
}
