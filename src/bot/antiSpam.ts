import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type Message,
  type TextChannel,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { buildPanel, panelError, panelSuccess, ephemeral, ERROR_ACCENT_COLOR } from "@/bot/ui";
import { SPAM_VIOLATION_TYPE, SPAM_ACTION } from "@/lib/constants";
import type { ShopSetting } from "@prisma/client";

type ViolationType = (typeof SPAM_VIOLATION_TYPE)[keyof typeof SPAM_VIOLATION_TYPE];

export const VIOLATION_LABEL: Record<string, string> = {
  [SPAM_VIOLATION_TYPE.FLOOD]: "도배 (연속 전송)",
  [SPAM_VIOLATION_TYPE.DUPLICATE]: "동일/복붙 메시지 반복",
  [SPAM_VIOLATION_TYPE.REPEAT_CHAR]: "같은 문자 반복",
  [SPAM_VIOLATION_TYPE.CROSS_CHANNEL]: "여러 채널 동일 내용 전송",
  [SPAM_VIOLATION_TYPE.MENTION_BOMB]: "멘션 폭탄",
  [SPAM_VIOLATION_TYPE.EMOJI_SPAM]: "이모지 도배",
  [SPAM_VIOLATION_TYPE.INVITE_LINK]: "초대 링크 반복",
  [SPAM_VIOLATION_TYPE.ATTACHMENT_FLOOD]: "파일/사진/영상 도배",
};

// 최근 24시간 내 위반 횟수(이번 건 포함)로 제재 단계를 올린다.
const ESCALATION_TIERS: { count: number; timeoutSeconds: number | null }[] = [
  { count: 1, timeoutSeconds: null }, // 1회 - 삭제만, 경고
  { count: 2, timeoutSeconds: 5 * 60 },
  { count: 3, timeoutSeconds: 30 * 60 },
  { count: 4, timeoutSeconds: 3 * 60 * 60 },
  { count: 5, timeoutSeconds: 24 * 60 * 60 },
];
function timeoutSecondsForCount(count: number): number | null {
  let result: number | null = ESCALATION_TIERS[0].timeoutSeconds;
  for (const tier of ESCALATION_TIERS) {
    if (count >= tier.count) result = tier.timeoutSeconds;
  }
  return result;
}
const VIOLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}시간`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}분`;
  return `${seconds}초`;
}

// ── 실시간 추적용 인메모리 상태 (서버 재시작 시 리셋 - 통계/이력은 DB의 SpamViolation이 담당) ──
type RecentMsg = { content: string; normalized: string; channelId: string; at: number; hasAttachment: boolean };
const recentByUser = new Map<string, RecentMsg[]>(); // key: `${guildId}:${discordUserId}`
const guildViolationTimestamps = new Map<string, number[]>(); // key: guildId
const emergencyUntilByGuild = new Map<string, number>(); // key: guildId
const priorRateLimitByChannel = new Map<string, number>(); // key: channelId - 긴급모드 종료 시 복원용

function normalize(content: string): string {
  return content.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/gi;
const EMOJI_REGEX = /<a?:\w+:\d+>|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const REPEAT_CHAR_REGEX = /(.)\1{9,}/u; // 같은 문자 10회 이상 반복

function trackMessage(key: string, msg: RecentMsg, windowMs: number): RecentMsg[] {
  const cutoff = Date.now() - windowMs;
  const pruned = (recentByUser.get(key) ?? []).filter((m) => m.at >= cutoff);
  pruned.push(msg);
  recentByUser.set(key, pruned);
  return pruned;
}

async function isWhitelisted(message: Message, settings: ShopSetting): Promise<boolean> {
  if (message.member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (settings.antiSpamWhitelistRoleId && message.member?.roles.cache.has(settings.antiSpamWhitelistRoleId)) return true;
  const linkedAdmin = await prisma.adminUser.findUnique({ where: { discordId: message.author.id } });
  return !!linkedAdmin && linkedAdmin.status === "ACTIVE";
}

/**
 * 메시지 도배/멘션 폭탄/이모지 도배/초대 링크/복붙/파일 도배 등을 감지해서 자동으로
 * 삭제+제재한다. messageCreate 디스패처(src/bot/index.ts)에서 runForGuild로 감싸인
 * 채로 호출되므로, 이 안에서 쓰는 prisma는 이미 그 서버(샵)의 DB로 연결되어 있다.
 */
export async function handleAntiSpamMessage(message: Message) {
  if (!message.guild || !message.member || message.author.bot) return;

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.antiSpamEnabled) return;
  if (await isWhitelisted(message, settings)) return;

  const guildId = message.guild.id;
  const key = `${guildId}:${message.author.id}`;
  const content = message.content ?? "";
  const normalized = normalize(content);
  const now = Date.now();

  const floodWindowMs = settings.antiSpamFloodWindowSec * 1000;
  const trackWindowMs = Math.max(floodWindowMs * 2, 15000); // 복붙/크로스채널 비교는 좀 더 넓게 본다
  const history = trackMessage(
    key,
    { content, normalized, channelId: message.channelId, at: now, hasAttachment: message.attachments.size > 0 },
    trackWindowMs
  );

  let violation: ViolationType | null = null;

  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= settings.antiSpamMentionLimit) {
    violation = SPAM_VIOLATION_TYPE.MENTION_BOMB;
  }

  if (!violation && REPEAT_CHAR_REGEX.test(content)) {
    violation = SPAM_VIOLATION_TYPE.REPEAT_CHAR;
  }

  if (!violation && INVITE_REGEX.test(content)) {
    const recentInviteCount = history.filter((m) => INVITE_REGEX.test(m.content)).length;
    if (recentInviteCount >= 2) violation = SPAM_VIOLATION_TYPE.INVITE_LINK;
  }

  if (!violation) {
    const emojiMatches = content.match(EMOJI_REGEX);
    if (emojiMatches && emojiMatches.length >= 15) violation = SPAM_VIOLATION_TYPE.EMOJI_SPAM;
  }

  if (!violation && message.attachments.size > 0) {
    const attachmentWindowMs = floodWindowMs * 2;
    const recentAttachments = history.filter((m) => m.hasAttachment && now - m.at <= attachmentWindowMs);
    if (recentAttachments.length >= Math.max(4, settings.antiSpamFloodCount - 2)) {
      violation = SPAM_VIOLATION_TYPE.ATTACHMENT_FLOOD;
    }
  }

  if (!violation) {
    const recentInFloodWindow = history.filter((m) => now - m.at <= floodWindowMs);
    if (recentInFloodWindow.length >= settings.antiSpamFloodCount) violation = SPAM_VIOLATION_TYPE.FLOOD;
  }

  if (!violation && normalized.length >= 2) {
    const dupCount = history.filter((m) => m.normalized === normalized).length;
    if (dupCount >= 3) violation = SPAM_VIOLATION_TYPE.DUPLICATE;
  }

  if (!violation && normalized.length >= 2) {
    const channelsHit = new Set(history.filter((m) => m.normalized === normalized).map((m) => m.channelId));
    if (channelsHit.size >= 2) violation = SPAM_VIOLATION_TYPE.CROSS_CHANNEL;
  }

  if (!violation) return;

  await applySanction(message, violation, settings);
  trackGuildViolation(guildId, settings);
  await maybeTriggerEmergencyMode(message.guild, settings).catch((e) => console.error("안티스팸 긴급모드 처리 실패:", e));
}

async function applySanction(message: Message, violation: ViolationType, settings: ShopSetting) {
  const guildId = message.guild!.id;
  await message.delete().catch(() => {});

  const since = new Date(Date.now() - VIOLATION_WINDOW_MS);
  const recentCount = await prisma.spamViolation.count({
    where: { guildId, discordUserId: message.author.id, createdAt: { gte: since }, lifted: false },
  });
  const count = recentCount + 1;
  const timeoutSeconds = timeoutSecondsForCount(count);

  if (timeoutSeconds) {
    await message.member?.timeout(timeoutSeconds * 1000, `자동 안티스팸 제재 (${violation}, 최근 24h ${count}회째)`).catch(() => {});
  }

  const record = await prisma.spamViolation.create({
    data: {
      guildId,
      discordUserId: message.author.id,
      discordTag: message.author.tag,
      channelId: message.channelId,
      violationType: violation,
      messageExcerpt: (message.content || "(텍스트 없음 - 첨부파일 등)").slice(0, 300),
      actionTaken: timeoutSeconds ? SPAM_ACTION.TIMEOUT : SPAM_ACTION.DELETE_ONLY,
      timeoutSeconds,
    },
  });

  if (settings.antiSpamLogChannelId) {
    await postSpamLog(message, record.id, violation, count, timeoutSeconds, settings.antiSpamLogChannelId);
  }
}

async function postSpamLog(
  message: Message,
  violationId: string,
  violation: ViolationType,
  count: number,
  timeoutSeconds: number | null,
  logChannelId: string
) {
  const channel = await message.guild!.channels.fetch(logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`antispam:lift:${violationId}`).setLabel("🔓 제재 해제 (오탐)").setStyle(ButtonStyle.Secondary)
  );

  const payload = buildPanel({
    title: "🛡️ 안티스팸 자동 제재",
    accentColor: ERROR_ACCENT_COLOR,
    fields: [
      { name: "대상", value: `<@${message.author.id}> (${message.author.tag})` },
      { name: "채널", value: `<#${message.channelId}>` },
      { name: "위반 유형", value: VIOLATION_LABEL[violation] ?? violation },
      { name: "조치", value: timeoutSeconds ? `삭제 + 타임아웃 ${formatDuration(timeoutSeconds)}` : "삭제 (타임아웃 없음, 1회차)" },
      { name: "최근 24시간 위반", value: `${count}회` },
      { name: "메시지 내용", value: message.content ? message.content.slice(0, 500) : "(텍스트 없음 - 첨부파일 등)" },
    ],
    rows: [row],
  });
  await (channel as TextChannel).send(payload).catch(() => {});
}

function trackGuildViolation(guildId: string, settings: ShopSetting) {
  const now = Date.now();
  const windowMs = settings.antiSpamEmergencyWindowSec * 1000;
  const list = (guildViolationTimestamps.get(guildId) ?? []).filter((t) => now - t <= windowMs);
  list.push(now);
  guildViolationTimestamps.set(guildId, list);
}

/** 짧은 시간에 서버 전체 위반이 급증하면 모든 텍스트 채널에 임시 슬로우모드를 걸어 진정시킨다. */
async function maybeTriggerEmergencyMode(guild: Guild, settings: ShopSetting) {
  const guildId = guild.id;
  const now = Date.now();
  if ((emergencyUntilByGuild.get(guildId) ?? 0) > now) return; // 이미 긴급모드 중

  const list = guildViolationTimestamps.get(guildId) ?? [];
  if (list.length < settings.antiSpamEmergencyThreshold) return;

  const durationMs = settings.antiSpamEmergencyDurationMin * 60 * 1000;
  emergencyUntilByGuild.set(guildId, now + durationMs);
  guildViolationTimestamps.set(guildId, []);

  const channels = await guild.channels.fetch();
  const textChannels = [...channels.values()].filter(
    (c): c is TextChannel => !!c && c.isTextBased() && "setRateLimitPerUser" in c
  );
  for (const ch of textChannels) {
    priorRateLimitByChannel.set(ch.id, ch.rateLimitPerUser ?? 0);
    await ch.setRateLimitPerUser(10, "안티스팸 긴급모드 발동").catch(() => {});
  }

  if (settings.antiSpamLogChannelId) {
    const logChannel = await guild.channels.fetch(settings.antiSpamLogChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      await (logChannel as TextChannel)
        .send(
          buildPanel({
            title: "🚨 안티스팸 긴급모드 발동",
            accentColor: ERROR_ACCENT_COLOR,
            description: `최근 ${settings.antiSpamEmergencyWindowSec}초 안에 위반이 ${list.length}건 감지되어, 전체 텍스트 채널에 ${settings.antiSpamEmergencyDurationMin}분간 슬로우모드(10초)를 적용했습니다. 자동으로 해제됩니다.`,
          })
        )
        .catch(() => {});
    }
  }

  setTimeout(() => {
    revertEmergencyMode(guild).catch((e) => console.error("안티스팸 긴급모드 해제 실패:", e));
  }, durationMs);
}

async function revertEmergencyMode(guild: Guild) {
  emergencyUntilByGuild.delete(guild.id);
  const channels = await guild.channels.fetch();
  for (const ch of [...channels.values()]) {
    if (!ch || !ch.isTextBased() || !("setRateLimitPerUser" in ch)) continue;
    const prior = priorRateLimitByChannel.get(ch.id) ?? 0;
    priorRateLimitByChannel.delete(ch.id);
    await (ch as TextChannel).setRateLimitPerUser(prior, "안티스팸 긴급모드 해제").catch(() => {});
  }
}

/** 관리자 로그 패널의 "🔓 제재 해제" 버튼 - 오탐 처리 + 걸려있던 타임아웃도 실제로 해제한다. */
export async function handleAntiSpamLift(interaction: ButtonInteraction, violationId: string) {
  const admin = await requireLinkedAdmin(interaction.user.id);
  const violation = await prisma.spamViolation.findUnique({ where: { id: violationId } });
  if (!violation) return interaction.reply(ephemeral(panelError("존재하지 않는 제재 기록입니다.")));
  if (violation.lifted) return interaction.reply(ephemeral(panelError("이미 해제된 제재입니다.")));

  await prisma.spamViolation.update({
    where: { id: violationId },
    data: { lifted: true, liftedByAdminId: admin.id, liftedAt: new Date() },
  });

  const guild = interaction.guild;
  if (guild) {
    const member = await guild.members.fetch(violation.discordUserId).catch(() => null);
    if (member?.communicationDisabledUntil) await member.timeout(null, "안티스팸 오탐 해제").catch(() => {});
  }

  await interaction.reply(ephemeral(panelSuccess(`${violation.discordTag}님의 제재를 오탐으로 처리하고 해제했습니다.`)));
}
