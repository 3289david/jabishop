import { ChannelType, type Client, type Guild, type TextBasedChannel } from "discord.js";
import { prisma } from "@/lib/prisma";

const POLL_INTERVAL_MS = 15_000;
let running = false;

async function setProgress(backupId: string, progress: string) {
  await prisma.serverBackup.update({ where: { id: backupId }, data: { progress } }).catch(() => {});
}

async function backupMessagesForChannel(channel: TextBasedChannel, backupChannelId: string, backupId: string) {
  let before: string | undefined;
  let total = 0;
  for (let page = 0; page < 2000; page++) {
    // 2000페이지 * 100개 = 최대 20만개 - 그 이상은 봇/호스트 부담이 너무 커 일단 상한선을 둔다.
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;

    const rows = [...batch.values()].map((m) => ({
      channelId: backupChannelId,
      originalId: m.id,
      authorId: m.author.id,
      authorName: m.author.username,
      authorAvatarUrl: m.author.displayAvatarURL(),
      content: m.content,
      attachmentUrls: m.attachments.size > 0 ? JSON.stringify([...m.attachments.values()].map((a) => a.url)) : null,
      reactions:
        m.reactions.cache.size > 0
          ? JSON.stringify([...m.reactions.cache.values()].map((r) => ({ emoji: r.emoji.toString(), count: r.count })))
          : null,
      postedAt: m.createdAt,
    }));
    await prisma.backupMessage.createMany({ data: rows });
    total += rows.length;
    before = batch.last()?.id;

    await prisma.serverBackup.update({ where: { id: backupId }, data: { messageCount: { increment: rows.length } } }).catch(() => {});
    if (batch.size < 100) break;
  }
  return total;
}

async function backupGuild(client: Client, backupId: string, guildId: string) {
  const guild: Guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
  await guild.roles.fetch();
  await guild.channels.fetch();

  await setProgress(backupId, "역할 백업 중...");
  const roles = [...guild.roles.cache.values()];
  await prisma.backupRole.createMany({
    data: roles.map((r) => ({
      backupId,
      originalId: r.id,
      name: r.name,
      color: r.color,
      permissions: r.permissions.bitfield.toString(),
      position: r.position,
      hoist: r.hoist,
      mentionable: r.mentionable,
    })),
  });
  await prisma.serverBackup.update({ where: { id: backupId }, data: { roleCount: roles.length } });

  await setProgress(backupId, "카테고리 백업 중...");
  const categoryChannels = [...guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).values()];
  for (const cat of categoryChannels) {
    await prisma.backupCategory.create({
      data: {
        backupId,
        originalId: cat.id,
        name: cat.name,
        position: cat.position,
        overwrites: JSON.stringify(
          [...cat.permissionOverwrites.cache.values()].map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() }))
        ),
      },
    });
  }
  const backupCategories = await prisma.backupCategory.findMany({ where: { backupId } });

  await setProgress(backupId, "채널 백업 중...");
  const normalChannels = [...guild.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).values()];
  let channelCount = 0;
  for (const ch of normalChannels) {
    if (!("permissionOverwrites" in ch)) continue;
    const parentCat = ch.parentId ? backupCategories.find((c) => c.originalId === ch.parentId) : undefined;
    const overwrites = "permissionOverwrites" in ch && ch.permissionOverwrites
      ? [...ch.permissionOverwrites.cache.values()].map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() }))
      : [];
    const backupChannel = await prisma.backupChannel.create({
      data: {
        backupId,
        categoryId: parentCat?.id ?? null,
        originalId: ch.id,
        name: ch.name,
        type: ch.type,
        topic: "topic" in ch ? ch.topic ?? null : null,
        position: "position" in ch ? ch.position : 0,
        nsfw: "nsfw" in ch ? Boolean(ch.nsfw) : false,
        overwrites: JSON.stringify(overwrites),
      },
    });
    channelCount++;
    await prisma.serverBackup.update({ where: { id: backupId }, data: { channelCount } });

    if (ch.isTextBased() && "messages" in ch) {
      await setProgress(backupId, `메시지 백업 중... (#${ch.name})`);
      await backupMessagesForChannel(ch, backupChannel.id, backupId).catch((e) => console.error(`#${ch.name} 메시지 백업 실패:`, e));
    }
  }

  await setProgress(backupId, "멤버 백업 중...");
  const members = await guild.members.fetch();
  await prisma.backupMember.createMany({
    data: [...members.values()].map((m) => ({
      backupId,
      discordUserId: m.id,
      username: m.user.username,
      nickname: m.nickname,
      roleIds: JSON.stringify([...m.roles.cache.keys()].filter((id) => id !== guild.id)),
      joinedAt: m.joinedAt,
    })),
  });
  await prisma.serverBackup.update({ where: { id: backupId }, data: { memberCount: members.size } });
}

export async function runPendingBackupJobs(client: Client) {
  if (running) return;
  running = true;
  try {
    const job = await prisma.serverBackup.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
    if (!job) return;

    await prisma.serverBackup.update({ where: { id: job.id }, data: { status: "RUNNING", progress: "시작 중..." } });
    try {
      await backupGuild(client, job.id, job.guildId);
      await prisma.serverBackup.update({ where: { id: job.id }, data: { status: "DONE", progress: "완료", completedAt: new Date() } });
    } catch (e) {
      console.error("서버 백업 실패:", e);
      await prisma.serverBackup.update({
        where: { id: job.id },
        data: { status: "FAILED", error: e instanceof Error ? e.message : "알 수 없는 오류" },
      });
    }
  } finally {
    running = false;
  }
}

export function startServerBackupLoop(client: Client) {
  runPendingBackupJobs(client).catch((e) => console.error("서버 백업 큐 초기 실행 실패:", e));
  setInterval(() => {
    runPendingBackupJobs(client).catch((e) => console.error("서버 백업 큐 실패:", e));
  }, POLL_INTERVAL_MS);
}
