import { ChannelType, PermissionsBitField, type Client, type Guild, type TextChannel } from "discord.js";
import { prisma } from "@/lib/prisma";
import { sendDiscordDM } from "@/lib/discordNotify";

const POLL_INTERVAL_MS = 15_000;
let running = false;

type Overwrite = { id: string; type: 0 | 1; allow: string; deny: string };

async function setProgress(jobId: string, progress: string) {
  await prisma.restoreJob.update({ where: { id: jobId }, data: { progress } }).catch(() => {});
}

/** 역할을 복원/복제한다. 같은 서버 복원이면 이름이 같은 역할을 재사용하고, 새 서버 복제면 항상 새로 만든다. */
async function buildRoleIdMap(
  targetGuild: Guild,
  backupGuildId: string,
  roles: { originalId: string; name: string; color: number; permissions: string; hoist: boolean; mentionable: boolean }[],
  mode: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const existingByName = new Map(targetGuild.roles.cache.map((r) => [r.name, r.id]));

  for (const r of roles) {
    if (r.originalId === backupGuildId) {
      map.set(r.originalId, targetGuild.id); // @everyone
      continue;
    }
    if (mode === "RESTORE_SAME" && existingByName.has(r.name)) {
      map.set(r.originalId, existingByName.get(r.name)!);
      continue;
    }
    try {
      const created = await targetGuild.roles.create({
        name: r.name,
        color: r.color,
        permissions: new PermissionsBitField(BigInt(r.permissions)),
        hoist: r.hoist,
        mentionable: r.mentionable,
      });
      map.set(r.originalId, created.id);
    } catch (e) {
      console.error(`역할 "${r.name}" 생성 실패:`, e);
    }
  }
  return map;
}

function mapOverwrites(raw: string, roleIdMap: Map<string, string>, mode: string, targetGuild: Guild) {
  const overwrites: Overwrite[] = JSON.parse(raw || "[]");
  const result: { id: string; allow: bigint; deny: bigint; type: 0 | 1 }[] = [];
  for (const o of overwrites) {
    if (o.type === 0) {
      const newId = roleIdMap.get(o.id);
      if (newId) result.push({ id: newId, type: 0, allow: BigInt(o.allow), deny: BigInt(o.deny) });
    } else if (o.type === 1 && mode === "RESTORE_SAME") {
      // 멤버별 개별 권한 - 같은 서버 복원이면 그 멤버가 여전히 있을 때만 유지, 새 서버 복제는 포기.
      if (targetGuild.members.cache.has(o.id)) {
        result.push({ id: o.id, type: 1, allow: BigInt(o.allow), deny: BigInt(o.deny) });
      }
    }
  }
  return result;
}

async function restoreMessages(channel: TextChannel, backupChannelId: string) {
  const messages = await prisma.backupMessage.findMany({ where: { channelId: backupChannelId }, orderBy: { postedAt: "asc" } });
  if (messages.length === 0) return;

  const webhook = await channel.createWebhook({ name: "백업 복원" }).catch(() => null);
  if (!webhook) return;

  for (const m of messages) {
    const attachments: string[] = m.attachmentUrls ? JSON.parse(m.attachmentUrls) : [];
    const content = [m.content, ...attachments].filter(Boolean).join("\n") || "(내용 없음)";
    try {
      const sent = await webhook.send({
        content: content.slice(0, 2000),
        username: m.authorName.slice(0, 80),
        avatarURL: m.authorAvatarUrl ?? undefined,
      });
      const reactions: { emoji: string; count: number }[] = m.reactions ? JSON.parse(m.reactions) : [];
      for (const r of reactions.slice(0, 20)) {
        await sent.react(r.emoji).catch(() => {});
      }
    } catch {
      // 레이트리밋/권한 문제 등 - 이 메시지 하나만 건너뛰고 계속
    }
  }

  await webhook.delete().catch(() => {});
}

async function restoreOrClone(client: Client, jobId: string) {
  const job = await prisma.restoreJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const backup = await prisma.serverBackup.findUnique({ where: { id: job.backupId } });
  if (!backup) throw new Error("백업을 찾을 수 없습니다.");

  await setProgress(jobId, "대상 서버 확인 중...");
  const targetGuild = await client.guilds.fetch(job.targetGuildId).catch(() => null);
  if (!targetGuild) throw new Error("대상 서버에 봇이 없거나 접근할 수 없습니다. 먼저 봇을 그 서버에 초대해주세요.");
  await targetGuild.roles.fetch();
  await targetGuild.channels.fetch();
  await targetGuild.members.fetch().catch(() => {});

  await setProgress(jobId, "역할 복원 중...");
  const roles = await prisma.backupRole.findMany({ where: { backupId: backup.id } });
  const roleIdMap = await buildRoleIdMap(targetGuild, backup.guildId, roles, job.mode);

  await setProgress(jobId, "카테고리 복원 중...");
  const categories = await prisma.backupCategory.findMany({ where: { backupId: backup.id } });
  const categoryIdMap = new Map<string, string>(); // BackupCategory.id -> 실제 디스코드 카테고리 id
  const existingCatByName = new Map(targetGuild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).map((c) => [c.name, c.id]));
  for (const cat of categories) {
    if (job.mode === "RESTORE_SAME" && existingCatByName.has(cat.name)) {
      categoryIdMap.set(cat.id, existingCatByName.get(cat.name)!);
      continue;
    }
    const overwrites = mapOverwrites(cat.overwrites, roleIdMap, job.mode, targetGuild);
    const created = await targetGuild.channels
      .create({ name: cat.name, type: ChannelType.GuildCategory, position: cat.position, permissionOverwrites: overwrites })
      .catch((e) => {
        console.error(`카테고리 "${cat.name}" 생성 실패:`, e);
        return null;
      });
    if (created) categoryIdMap.set(cat.id, created.id);
  }

  await setProgress(jobId, "채널 복원 중...");
  const channels = await prisma.backupChannel.findMany({ where: { backupId: backup.id }, orderBy: { position: "asc" } });
  const existingChByName = new Map(targetGuild.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).map((c) => [c.name, c.id]));
  let restoredChannelCount = 0;

  for (const ch of channels) {
    const parentId = ch.categoryId ? categoryIdMap.get(ch.categoryId) : undefined;
    let channelId: string | null = null;
    let isNew = false;

    if (job.mode === "RESTORE_SAME" && existingChByName.has(ch.name)) {
      channelId = existingChByName.get(ch.name)!;
    } else {
      const overwrites = mapOverwrites(ch.overwrites, roleIdMap, job.mode, targetGuild);
      const created = await targetGuild.channels
        .create({
          name: ch.name,
          type: ch.type === ChannelType.GuildVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: parentId as string | undefined,
          topic: ch.topic ?? undefined,
          nsfw: ch.nsfw,
          position: ch.position,
          permissionOverwrites: overwrites,
        })
        .catch((e) => {
          console.error(`채널 "${ch.name}" 생성 실패:`, e);
          return null;
        });
      if (created) {
        channelId = created.id;
        isNew = true;
      }
    }

    if (!channelId) continue;
    restoredChannelCount++;

    // 기존 채널을 그대로 재사용한 경우(같은 서버 복원)는 메시지가 이미 그대로 있으므로
    // 다시 올리면 중복이 생긴다 - 새로 만든 채널에만 메시지를 재게시한다.
    if (isNew) {
      const channel = targetGuild.channels.cache.get(channelId);
      if (channel?.isTextBased() && channel.type === ChannelType.GuildText) {
        await setProgress(jobId, `메시지 복원 중... (#${ch.name})`);
        await restoreMessages(channel as TextChannel, ch.id).catch((e) => console.error(`#${ch.name} 메시지 복원 실패:`, e));
      }
    }
  }

  await setProgress(jobId, "멤버 복원 중...");
  const members = await prisma.backupMember.findMany({ where: { backupId: backup.id } });

  if (job.mode === "RESTORE_SAME") {
    // 아직 서버에 있는 멤버한테만 예전 역할을 다시 붙여준다 (새로 생긴 역할은 그대로 둠).
    for (const m of members) {
      const member = targetGuild.members.cache.get(m.discordUserId);
      if (!member) continue;
      const oldRoleIds: string[] = JSON.parse(m.roleIds);
      const mappedIds = oldRoleIds.map((id) => roleIdMap.get(id)).filter((id): id is string => !!id);
      if (mappedIds.length > 0) await member.roles.add(mappedIds).catch(() => {});
    }
  } else {
    // 새 서버 복제 - 멤버를 자동으로 옮길 방법이 없어(디스코드는 봇이 임의로 유저를
    // 다른 서버에 추가하는 걸 허용하지 않음), 초대 링크를 DM으로 보내는 것까지만 한다.
    const firstTextChannel = targetGuild.channels.cache.find((c) => c.isTextBased() && c.type === ChannelType.GuildText) as
      | TextChannel
      | undefined;
    const invite = firstTextChannel
      ? await firstTextChannel.createInvite({ maxAge: 7 * 24 * 60 * 60, maxUses: 0, unique: true }).catch(() => null)
      : null;
    if (invite) {
      for (const m of members) {
        await sendDiscordDM(m.discordUserId, {
          embeds: [
            {
              title: "📦 서버 복제 안내",
              description: `서버가 새 디스코드 서버로 복제되었습니다. 아래 링크로 들어와주세요.\n\n${invite.url}\n\n(역할은 자동으로 복원되지 않으니, 들어온 뒤 관리자에게 문의해주세요.)`,
              color: 0x6366f1,
              timestamp: new Date().toISOString(),
            },
          ],
        }).catch(() => {});
      }
    }
  }

  await prisma.restoreJob.update({
    where: { id: jobId },
    data: { progress: `완료 - 채널 ${restoredChannelCount}개 복원/복제됨` },
  });
}

export async function runPendingRestoreJobs(client: Client) {
  if (running) return;
  running = true;
  try {
    const job = await prisma.restoreJob.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
    if (!job) return;

    await prisma.restoreJob.update({ where: { id: job.id }, data: { status: "RUNNING", progress: "시작 중..." } });
    try {
      await restoreOrClone(client, job.id);
      await prisma.restoreJob.update({ where: { id: job.id }, data: { status: "DONE", completedAt: new Date() } });
    } catch (e) {
      console.error("서버 복원/복제 실패:", e);
      await prisma.restoreJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: e instanceof Error ? e.message : "알 수 없는 오류" },
      });
    }
  } finally {
    running = false;
  }
}

export function startServerRestoreLoop(client: Client) {
  runPendingRestoreJobs(client).catch((e) => console.error("서버 복원 큐 초기 실행 실패:", e));
  setInterval(() => {
    runPendingRestoreJobs(client).catch((e) => console.error("서버 복원 큐 실패:", e));
  }, POLL_INTERVAL_MS);
}
