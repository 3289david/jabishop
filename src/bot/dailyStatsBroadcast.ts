import type { Client } from "discord.js";
import { prisma } from "@/lib/prisma";
import { statsEmbed } from "@/bot/commands/adminStats";

// 하루에 한 번, 관리자가 설정한 공지 채널에 오늘 매출/주문/재고/회원/환불/문의 통계를 자동 게시한다.
// 정확히 24시간마다 도는 타이머 대신, 마지막 게시 시각을 DB에 저장해두고 주기적으로
// "24시간이 지났는지" 체크하는 방식이라 봇이 재시작돼도 하루 1회가 보장된다.

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분마다 체크
const BROADCAST_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간

export async function maybeSendDailyStatsBroadcast(client: Client) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.announcementChannelId) return;

  const last = settings.dailyStatsLastPosted;
  if (last && Date.now() - last.getTime() < BROADCAST_INTERVAL_MS) return;

  const channel = await client.channels.fetch(settings.announcementChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) return;

  const embed = await statsEmbed();
  await channel.send({ embeds: [embed] }).catch(() => {});

  await prisma.shopSetting.update({ where: { id: "singleton" }, data: { dailyStatsLastPosted: new Date() } });
}

export function startDailyStatsBroadcastLoop(client: Client) {
  maybeSendDailyStatsBroadcast(client).catch((e) => console.error("일일 통계 공지 초기 실행 실패:", e));
  setInterval(() => {
    maybeSendDailyStatsBroadcast(client).catch((e) => console.error("일일 통계 공지 실패:", e));
  }, CHECK_INTERVAL_MS);
}
