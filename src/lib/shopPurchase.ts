import { prisma } from "@/lib/prisma";
import { POINT_TX_TYPE } from "@/lib/constants";
import { teardownShopInfra } from "@/lib/provisionShop";

export class ShopPurchaseError extends Error {}

const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// 실제 구매 흐름("자판기 통째로 구매" 등급을 사는 것)은 src/lib/orders.ts의
// purchaseTier() -> purchaseShopSubscriptionTier()에 있다 - 다른 등급과 똑같은
// 구매 경로(상품 목록 -> 상세 -> 구매하기)로 사게 하기 위해 그쪽으로 통합했다.

/**
 * 매월 구독료를 자동으로 차감한다. 결제가 밀리면(포인트 부족) 바로 서비스를 내린다
 * (DNS/nginx/프로세스 즉시 중단, 상태는 CANCELLED) - 단, DB 파일은 지우지 않고 남겨둬서
 * 나중에 포인트를 채우면 관리자가 다시 살려줄 수는 있게 해둔다.
 */
export async function runShopBillingCycle() {
  const due = await prisma.shop.findMany({
    where: { status: "ACTIVE", nextBillingAt: { lte: new Date() } },
  });

  for (const shop of due) {
    if (!shop.ownerUserId) {
      await teardownShopInfra(shop.slug).catch(() => {});
      await prisma.shop.update({ where: { id: shop.id }, data: { status: "CANCELLED", provisionError: "소유자 없음" } });
      continue;
    }

    const user = await prisma.user.findUnique({ where: { id: shop.ownerUserId } });
    if (!user || user.points < shop.subscriptionPrice) {
      await teardownShopInfra(shop.slug).catch(() => {});
      await prisma.shop.update({
        where: { id: shop.id },
        data: { status: "CANCELLED", provisionError: "포인트 부족으로 결제가 밀려 즉시 취소됨" },
      });
      continue;
    }

    const balanceAfter = user.points - shop.subscriptionPrice;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { points: balanceAfter } });
      await tx.pointTransaction.create({
        data: {
          userId: user.id,
          type: POINT_TX_TYPE.USE,
          amount: -shop.subscriptionPrice,
          balanceAfter,
          memo: `자판기 판매 구독 갱신 - ${shop.slug}.krl.kr`,
        },
      });
      await tx.shop.update({
        where: { id: shop.id },
        data: { nextBillingAt: new Date(Date.now() + BILLING_PERIOD_MS), provisionError: null },
      });
    });
  }

  return due.length;
}
