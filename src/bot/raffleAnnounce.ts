import type { Client } from "discord.js";
import { raffleDrawnEmbed } from "@/bot/raffleUI";

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

  const embed = raffleDrawnEmbed(raffle, winners, entryCount);

  if (raffle.messageId && "messages" in channel) {
    const msg = await channel.messages.fetch(raffle.messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  }

  const mentions = winners.map((w) => `<@${w.discordUserId}>`).join(" ");
  await channel
    .send({ content: winners.length > 0 ? `🎊 축하합니다! ${mentions}` : undefined, embeds: [embed] })
    .catch(() => {});
}
