import { prisma } from "@/lib/prisma";
import { forEachShop } from "@/lib/shop";
import { expireSeller } from "@/lib/sellers";
import { sendDiscordDM } from "@/lib/discordNotify";
import { SELLER_STATUS, POINT_TX_TYPE } from "@/lib/constants";

// 하루에 한 번이면 충분하지만, 재시작 시점에 따라 알림/결제가 밀릴 수 있으니 조금 더
// 자주(4시간) 체크한다 - 중복 알림은 lastReminderDays로, 중복 결제는 nextBillingAt을
// 매번 다음 결제일로 미리 갱신하는 것으로 막는다.
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const REMINDER_DAYS = [7, 3, 1];
const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 매월 이용료를 포인트로 자동 차감한다("자판기 판매" 구독 결제와 동일한 방식).
 * 디스코드 계정이 연동된 User가 없거나 포인트가 부족하면 즉시 정지한다
 * (expireSeller - 역할 회수 + 쇼룸 채널 읽기전용, 복구는 관리자가 /판매자관리 연장
 * 또는 /판매자관리 복구로 처리. 데이터는 삭제하지 않아 나중에 되살릴 수 있다).
 */
async function chargeOrExpireSeller(sellerId: string, discordUserId: string, price: number, guildId: string) {
  const user = await prisma.user.findUnique({ where: { discordId: discordUserId } });
  if (!user || user.points < price) {
    await expireSeller(sellerId, guildId).catch((e) => console.error("판매자 만료 처리 실패:", e));
    sendDiscordDM(discordUserId, {
      embeds: [
        {
          title: "❌ 판매자 이용료 결제 실패",
          description: `포인트가 부족해 이용료(${price.toLocaleString()}P)가 자동 결제되지 않아 판매 활동이 중단되었습니다. 포인트를 충전한 뒤 관리자에게 \`/판매자관리 연장\`을 요청해주세요.`,
          color: 0xef4444,
          timestamp: new Date().toISOString(),
        },
      ],
    }).catch(() => {});
    return;
  }

  const balanceAfter = user.points - price;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { points: balanceAfter } });
    await tx.pointTransaction.create({
      data: {
        userId: user.id,
        type: POINT_TX_TYPE.USE,
        amount: -price,
        balanceAfter,
        memo: "판매자 이용료 자동 결제",
      },
    });
    await tx.seller.update({
      where: { id: sellerId },
      data: { nextBillingAt: new Date(Date.now() + BILLING_PERIOD_MS), lastReminderDays: null },
    });
  });

  sendDiscordDM(discordUserId, {
    embeds: [
      {
        title: "💳 판매자 이용료 자동 결제 완료",
        description: `이용료 ${price.toLocaleString()}P가 자동 결제되었습니다. 다음 결제일: ${new Date(Date.now() + BILLING_PERIOD_MS).toLocaleDateString("ko-KR")}`,
        color: 0x22c55e,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});
}

async function runSellerBillingCycleForGuild(guildId: string | null) {
  if (!guildId) return;
  const now = Date.now();

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const price = settings?.sellerMonthlyPrice ?? 1000;

  const actives = await prisma.seller.findMany({ where: { status: SELLER_STATUS.ACTIVE, nextBillingAt: { not: null } } });
  for (const seller of actives) {
    if (!seller.nextBillingAt) continue;
    const daysLeft = Math.ceil((seller.nextBillingAt.getTime() - now) / (24 * 60 * 60 * 1000));

    if (daysLeft <= 0) {
      await chargeOrExpireSeller(seller.id, seller.discordUserId, price, guildId);
      continue;
    }

    const dueReminder = REMINDER_DAYS.find((d) => daysLeft <= d);
    if (dueReminder && seller.lastReminderDays !== dueReminder) {
      await sendDiscordDM(seller.discordUserId, {
        embeds: [
          {
            title: dueReminder === 1 ? "⚠️ 내일 판매자 이용료가 자동 결제됩니다" : `⏰ 판매자 이용료가 ${dueReminder}일 후 자동 결제됩니다`,
            description: `"${seller.storeName}" 이용료 ${price.toLocaleString()}P가 ${seller.nextBillingAt.toLocaleDateString("ko-KR")}에 포인트에서 자동 결제됩니다. 포인트가 부족하면 판매 활동이 중단되니 미리 충전해주세요.`,
            color: 0xf59e0b,
            timestamp: new Date().toISOString(),
          },
        ],
      }).catch(() => {});
      await prisma.seller.update({ where: { id: seller.id }, data: { lastReminderDays: dueReminder } });
    }
  }
}

export function startSellerBillingLoop() {
  const run = () => forEachShop(runSellerBillingCycleForGuild);
  run().catch((e) => console.error("판매자 이용료 결제 확인 초기 실행 실패:", e));
  setInterval(() => {
    run().catch((e) => console.error("판매자 이용료 결제 확인 실패:", e));
  }, CHECK_INTERVAL_MS);
}
