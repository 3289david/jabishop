import { prisma } from "@/lib/prisma";
import { POINT_TX_TYPE } from "@/lib/constants";
import { provisionShop, teardownShopInfra } from "@/lib/provisionShop";

export class ShopPurchaseError extends Error {}

const SHOP_SUBSCRIPTION_PRICE = 4000;
const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * "자판기 판매" - 자비샵 자체를 구매해서 자기 이름으로 운영하게 해준다. 먼저 포인트를
 * 차감하고(이 트랜잭션이 커밋된 뒤에만), 실제 서브도메인/DB/프로세스를 만든다
 * (src/lib/provisionShop.ts - DNS/nginx/pm2 등 DB 트랜잭션으로 되돌릴 수 없는 외부
 * 작업). 만들다가 실패하면 방금 뗀 포인트를 그대로 환불한다.
 */
export async function purchaseShopSubscription(params: {
  userId: string;
  slug: string;
  shopName: string;
  claimDiscordId?: string;
}) {
  const { userId, slug, shopName, claimDiscordId } = params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ShopPurchaseError("사용자를 찾을 수 없습니다.");
  if (user.points < SHOP_SUBSCRIPTION_PRICE) {
    throw new ShopPurchaseError(`포인트가 부족합니다. (필요: ${SHOP_SUBSCRIPTION_PRICE.toLocaleString()}P)`);
  }

  const balanceAfterCharge = user.points - SHOP_SUBSCRIPTION_PRICE;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { points: balanceAfterCharge } });
    await tx.pointTransaction.create({
      data: {
        userId,
        type: POINT_TX_TYPE.USE,
        amount: -SHOP_SUBSCRIPTION_PRICE,
        balanceAfter: balanceAfterCharge,
        memo: `자판기 판매 - ${slug}.krl.kr 1개월`,
      },
    });
  });

  try {
    const shop = await provisionShop({ slug, name: shopName, ownerUserId: userId, claimDiscordId });
    return shop;
  } catch (e) {
    // 실제 서비스가 만들어지지 못했으니 방금 뗀 포인트를 그대로 돌려준다.
    const refundedBalance = balanceAfterCharge + SHOP_SUBSCRIPTION_PRICE;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { points: refundedBalance } });
      await tx.pointTransaction.create({
        data: {
          userId,
          type: POINT_TX_TYPE.REFUND,
          amount: SHOP_SUBSCRIPTION_PRICE,
          balanceAfter: refundedBalance,
          memo: `자판기 판매 실패 환불 - ${slug}.krl.kr`,
        },
      });
    });
    throw e;
  }
}

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
