import type { Client } from "discord.js";
import { raffleDrawnPayload } from "@/bot/raffleUI";

type RaffleForAnnounce = {
  title: string;
  description: string | null;
  channelId: string;
  messageId: string | null;
  tier: { name: string };
};

/** 수동 마감(/이벤트마감추첨)과 자동 마감(raffleAutoClose)이 공유하는 결과 공지 로직. */
export async function announceRaffleResult(
  client: Client,
  raffle: RaffleForAnnounce,
  winners: { discordUserId: string; discordTag: string; grantFailed: boolean }[],
  entryCount: number
) {
  const channel = await client.channels.fetch(raffle.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) return;

  const payload = raffleDrawnPayload(raffle, winners, entryCount);

  if (raffle.messageId && "messages" in channel) {
    const msg = await channel.messages.fetch(raffle.messageId).catch(() => null);
    if (msg) await msg.edit({ ...payload, components: [] }).catch(() => {});
  }

  // Components V2 메시지는 content 필드를 못 쓴다(멘션 알림용 핑이 안 감) - 그래서
  // 실제로 알림이 가는 멘션 핑은 별도의 일반 메시지로 먼저 보내고, 결과 패널은 이어서 보낸다.
  if (winners.length > 0) {
    const mentions = winners.map((w) => `<@${w.discordUserId}>`).join(" ");
    await channel.send({ content: `🎊 축하합니다! ${mentions}` }).catch(() => {});
  }
  await channel.send(payload).catch(() => {});
}
