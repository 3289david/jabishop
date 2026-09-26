import type { Client } from "discord.js";
import { prisma } from "@/lib/prisma";
import { publicStatsEmbed } from "@/bot/publicStats";

// 공개 통계 패널이 항상 최신 상태를 보여주도록, 게시된 메시지를 주기적으로 편집한다.
const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5분마다 갱신

export async function updatePublicStatsPanel(client: Client) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.publicStatsChannelId || !settings.publicStatsMessageId) return;

  const channel = await client.channels.fetch(settings.publicStatsChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) return;

  const message = await channel.messages.fetch(settings.publicStatsMessageId).catch(() => null);
  if (!message) return;

  const embed = await publicStatsEmbed();
  await message.edit({ embeds: [embed] }).catch(() => {});
}

export function startPublicStatsLoop(client: Client) {
  updatePublicStatsPanel(client).catch((e) => console.error("공개 통계 패널 갱신 초기 실행 실패:", e));
  setInterval(() => {
    updatePublicStatsPanel(client).catch((e) => console.error("공개 통계 패널 갱신 실패:", e));
  }, UPDATE_INTERVAL_MS);
}
