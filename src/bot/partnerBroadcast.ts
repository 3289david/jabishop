import { prisma } from "@/lib/prisma";
import { sendWebhookMessage, sendChannelMessage } from "@/lib/discordNotify";
import { PARTNER_STATUS } from "@/lib/constants";

// 하루에 한 번, 양방향으로 파트너 홍보 문구를 자동 발송한다.
//  1) 자비샵 -> 파트너 서버: 관리자가 설정한 문구(partnerDailyMessage)를 승인된 모든
//     파트너의 웹훅으로 보낸다.
//  2) 파트너 -> 자비샵: 각 파트너가 직접 등록한 자기 홍보 문구(promoMessage)를 그
//     파트너의 채널(channelId)에 게시한다.
// 정확히 24시간마다 도는 타이머 대신, 마지막 발송 시각을 DB에 저장해두고 주기적으로
// "24시간이 지났는지" 체크하는 방식이라 봇이 재시작돼도 하루 1회가 보장된다.

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분마다 체크
const BROADCAST_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간

export async function maybeSendDailyPartnerBroadcast() {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings) return;

  const last = settings.partnerLastBroadcast;
  if (last && Date.now() - last.getTime() < BROADCAST_INTERVAL_MS) return;

  const partners = await prisma.partner.findMany({ where: { status: PARTNER_STATUS.APPROVED } });
  if (partners.length === 0) return; // 승인된 파트너가 없으면 "오늘 발송함" 처리를 하지 않는다 (생기면 바로 보내지도록).

  let sentAny = false;

  // 1) 자비샵 -> 파트너 서버
  if (settings.partnerDailyMessage) {
    for (const p of partners) {
      if (!p.webhookUrl) continue;
      await sendWebhookMessage(p.webhookUrl, settings.partnerDailyMessage);
      sentAny = true;
    }
  }

  // 2) 파트너 -> 자비샵 (각자 자기 채널에)
  for (const p of partners) {
    if (!p.promoMessage || !p.channelId) continue;
    await sendChannelMessage(p.channelId, { content: p.promoMessage });
    sentAny = true;
  }

  if (sentAny) {
    await prisma.shopSetting.update({ where: { id: "singleton" }, data: { partnerLastBroadcast: new Date() } });
  }
}

export function startPartnerBroadcastLoop() {
  maybeSendDailyPartnerBroadcast().catch((e) => console.error("파트너 일일 발송 초기 실행 실패:", e));
  setInterval(() => {
    maybeSendDailyPartnerBroadcast().catch((e) => console.error("파트너 일일 발송 실패:", e));
  }, CHECK_INTERVAL_MS);
}
