import { prisma } from "@/lib/prisma";
import { sendWebhookMessage } from "@/lib/discordNotify";
import { PARTNER_STATUS } from "@/lib/constants";

// 하루에 한 번, 관리자가 설정한 문구를 승인된 모든 파트너의 웹훅으로 보낸다.
// 정확히 24시간마다 도는 타이머 대신, 마지막 발송 시각을 DB에 저장해두고 주기적으로
// "24시간이 지났는지" 체크하는 방식이라 봇이 재시작돼도 하루 1회가 보장된다.

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분마다 체크
const BROADCAST_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간

export async function maybeSendDailyPartnerBroadcast() {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.partnerDailyMessage) return;

  const last = settings.partnerLastBroadcast;
  if (last && Date.now() - last.getTime() < BROADCAST_INTERVAL_MS) return;

  const partners = await prisma.partner.findMany({
    where: { status: PARTNER_STATUS.APPROVED, webhookUrl: { not: null } },
  });
  if (partners.length === 0) return; // 보낼 대상이 없으면 "오늘 발송함" 처리를 하지 않는다 (파트너 생기면 바로 보내지도록).

  for (const p of partners) {
    if (!p.webhookUrl) continue;
    await sendWebhookMessage(p.webhookUrl, settings.partnerDailyMessage);
  }

  await prisma.shopSetting.update({ where: { id: "singleton" }, data: { partnerLastBroadcast: new Date() } });
}

export function startPartnerBroadcastLoop() {
  maybeSendDailyPartnerBroadcast().catch((e) => console.error("파트너 일일 발송 초기 실행 실패:", e));
  setInterval(() => {
    maybeSendDailyPartnerBroadcast().catch((e) => console.error("파트너 일일 발송 실패:", e));
  }, CHECK_INTERVAL_MS);
}
