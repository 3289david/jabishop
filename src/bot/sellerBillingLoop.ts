import { prisma } from "@/lib/prisma";
import { forEachShop } from "@/lib/shop";
import { expireSeller } from "@/lib/sellers";
import { sendDiscordDM } from "@/lib/discordNotify";
import { SELLER_STATUS } from "@/lib/constants";

// 하루에 한 번이면 충분하지만, 재시작 시점에 따라 알림이 밀릴 수 있으니 조금 더 자주(4시간)
// 체크한다 - 중복 발송은 lastReminderDays로 막는다.
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const REMINDER_DAYS = [7, 3, 1];

async function runSellerBillingCycleForGuild(guildId: string | null) {
  if (!guildId) return;
  const now = Date.now();

  const actives = await prisma.seller.findMany({ where: { status: SELLER_STATUS.ACTIVE, nextBillingAt: { not: null } } });
  for (const seller of actives) {
    if (!seller.nextBillingAt) continue;
    const daysLeft = Math.ceil((seller.nextBillingAt.getTime() - now) / (24 * 60 * 60 * 1000));

    if (daysLeft <= 0) {
      await expireSeller(seller.id, guildId).catch((e) => console.error("판매자 만료 처리 실패:", e));
      continue;
    }

    const dueReminder = REMINDER_DAYS.find((d) => daysLeft <= d);
    if (dueReminder && seller.lastReminderDays !== dueReminder) {
      await sendDiscordDM(seller.discordUserId, {
        embeds: [
          {
            title: dueReminder === 1 ? "⚠️ 내일 판매자 이용기간이 종료됩니다" : `⏰ 판매자 이용기간이 ${dueReminder}일 후 종료됩니다`,
            description: `"${seller.storeName}" 이용기간이 ${seller.nextBillingAt.toLocaleDateString("ko-KR")}에 종료됩니다. 입금 후 관리자에게 연장을 요청해주세요.`,
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
  run().catch((e) => console.error("판매자 이용기간 확인 초기 실행 실패:", e));
  setInterval(() => {
    run().catch((e) => console.error("판매자 이용기간 확인 실패:", e));
  }, CHECK_INTERVAL_MS);
}
