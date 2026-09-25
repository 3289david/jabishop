import { EmbedBuilder, type Message, type TextBasedChannel } from "discord.js";
import { prisma } from "@/lib/prisma";
import { BRAND_COLOR } from "@/bot/format";
import type { StickyMessage } from "@prisma/client";

// 채널에 새 메시지가 올라올 때마다 고정 메시지를 지우고 다시 올려서, 항상 채널
// 맨 아래에 있는 것처럼 보이게 한다. 사람이 연달아 여러 메시지를 보낼 때마다
// 매번 지우고-다시-올리기를 반복하면 레이트리밋에 걸리기 쉬워서, 짧은 디바운스를
// 둬서 메시지가 잠잠해지면 한 번만 재게시한다.
const STICKY_DEBOUNCE_MS = 2000;
const pendingTimers = new Map<string, NodeJS.Timeout>();

export function buildStickyEmbed(sticky: Pick<StickyMessage, "title" | "content" | "imageUrl" | "color">) {
  const embed = new EmbedBuilder()
    .setColor(sticky.color ?? BRAND_COLOR)
    .setDescription(sticky.content)
    .setFooter({ text: "📌 고정 메시지" });
  if (sticky.title) embed.setTitle(sticky.title);
  if (sticky.imageUrl) embed.setImage(sticky.imageUrl);
  return embed;
}

/** 채널에 고정 메시지를 (재)게시하고 messageId를 최신화한다. 관리자 명령어와 자동 재게시가 공용으로 쓴다. */
export async function repostSticky(channelId: string, channel: TextBasedChannel) {
  if (!channel.isSendable()) return null;

  const sticky = await prisma.stickyMessage.findUnique({ where: { channelId } });
  if (!sticky) return null;

  if (sticky.messageId && "messages" in channel) {
    const old = await channel.messages.fetch(sticky.messageId).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }

  const sent = await channel.send({ embeds: [buildStickyEmbed(sticky)] });
  await prisma.stickyMessage.update({ where: { channelId }, data: { messageId: sent.id } });
  return sent;
}

export function handleStickyMessage(message: Message) {
  if (!message.guild || message.author.bot) return;

  const channelId = message.channelId;
  const channel = message.channel;

  const existing = pendingTimers.get(channelId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingTimers.delete(channelId);
    repostSticky(channelId, channel).catch((e) => console.error("고정 메시지 재게시 실패:", e));
  }, STICKY_DEBOUNCE_MS);
  pendingTimers.set(channelId, timer);
}
