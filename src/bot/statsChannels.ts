import { ChannelType, PermissionFlagsBits, type Client } from "discord.js";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS } from "@/lib/constants";

// 서버 상단에 "🔊ㅣ회원수: N명" / "🔊ㅣ구매자수: N명" 음성채널을 만들어두고,
// 실제로 들어갈 수는 없게(Connect 금지) 막아서 이름 자체가 실시간 통계판 역할을 하게 한다.

async function memberCount() {
  return prisma.user.count();
}

async function buyerCount() {
  const rows = await prisma.order.findMany({
    where: { status: ORDER_STATUS.COMPLETED },
    distinct: ["userId"],
    select: { userId: true },
  });
  return rows.length;
}

async function ensureStatChannel(
  client: Client,
  guildId: string,
  storedId: string | null,
  name: string
): Promise<string | null> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  if (storedId) {
    const existing = await guild.channels.fetch(storedId).catch(() => null);
    if (existing) return existing.id;
  }

  const created = await guild.channels
    .create({
      name,
      type: ChannelType.GuildVoice,
      position: 0,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.Connect],
        },
      ],
    })
    .catch(() => null);
  return created?.id ?? null;
}

export async function updateStatsChannels(client: Client) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return;

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings) return;

  const [members, buyers] = await Promise.all([memberCount(), buyerCount()]);
  const memberName = `🔊ㅣ회원수: ${members.toLocaleString()}명`;
  const buyerName = `🔊ㅣ구매자수: ${buyers.toLocaleString()}명`;

  const memberChannelId = await ensureStatChannel(client, guildId, settings.discordMemberCountChannelId, memberName);
  const buyerChannelId = await ensureStatChannel(client, guildId, settings.discordBuyerCountChannelId, buyerName);

  const updates: Record<string, string> = {};
  if (memberChannelId && memberChannelId !== settings.discordMemberCountChannelId) {
    updates.discordMemberCountChannelId = memberChannelId;
  }
  if (buyerChannelId && buyerChannelId !== settings.discordBuyerCountChannelId) {
    updates.discordBuyerCountChannelId = buyerChannelId;
  }
  if (Object.keys(updates).length > 0) {
    await prisma.shopSetting.update({ where: { id: "singleton" }, data: updates });
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  if (memberChannelId) {
    const ch = await guild.channels.fetch(memberChannelId).catch(() => null);
    if (ch && "name" in ch && ch.name !== memberName) await ch.setName(memberName).catch(() => {});
  }
  if (buyerChannelId) {
    const ch = await guild.channels.fetch(buyerChannelId).catch(() => null);
    if (ch && "name" in ch && ch.name !== buyerName) await ch.setName(buyerName).catch(() => {});
  }
}

const UPDATE_INTERVAL_MS = 10 * 60 * 1000; // Discord 채널명 변경 레이트리밋(10분당 2회)을 고려한 주기

export function startStatsChannelLoop(client: Client) {
  updateStatsChannels(client).catch((e) => console.error("통계 채널 초기화 실패:", e));
  setInterval(() => {
    updateStatsChannels(client).catch((e) => console.error("통계 채널 갱신 실패:", e));
  }, UPDATE_INTERVAL_MS);
}
