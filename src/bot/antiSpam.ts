import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
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
  [SPAM_VIOLATION_TYPE.IMAGE_BLOCKED]: "사진 업로드 금지 위반",
  [SPAM_VIOLATION_TYPE.VIDEO_BLOCKED]: "영상 업로드 금지 위반",
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

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi|m4v|gifv)$/i;

/** 메시지가 올라온 채널의 카테고리 ID를 구한다 - 스레드면 부모 채널의 카테고리까지 한 단계 더 거슬러 올라간다. */
function getCategoryId(channel: Message["channel"]): string | null {
  if (channel.isThread()) return channel.parent?.parentId ?? null;
  if ("parentId" in channel) return channel.parentId;
  return null;
}

/** 첨부파일이 사진/영상인지 판별한다 - content-type이 있으면 그걸, 없으면 확장자로 폴백한다. */
function classifyAttachmentKind(contentType: string | null, fileName: string | null): "image" | "video" | null {
  if (contentType?.startsWith("image/")) return "image";
  if (contentType?.startsWith("video/")) return "video";
  if (fileName) {
    if (IMAGE_EXT.test(fileName)) return "image";
    if (VIDEO_EXT.test(fileName)) return "video";
  }
  return null;
}

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

  // 사진/영상 업로드 전면 금지 - 도배 여부와 무관하게 1개만 올려도 즉시 위반 (최우선 체크).
  // 단, antiSpamMediaExemptCategoryIds에 등록된 카테고리(구매문의/티켓/관리자 등 스크린샷
  // 공유가 필요한 채널) 밑에서는 예외로 둔다.
  const exemptCategoryIds = (settings.antiSpamMediaExemptCategoryIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const channelCategoryId = getCategoryId(message.channel);
  const mediaExempt = !!channelCategoryId && exemptCategoryIds.includes(channelCategoryId);

  if (!mediaExempt && (settings.antiSpamBlockImages || settings.antiSpamBlockVideos) && message.attachments.size > 0) {
    for (const attachment of message.attachments.values()) {
      const kind = classifyAttachmentKind(attachment.contentType, attachment.name);
      if (kind === "image" && settings.antiSpamBlockImages) {
        violation = SPAM_VIOLATION_TYPE.IMAGE_BLOCKED;
        break;
      }
      if (kind === "video" && settings.antiSpamBlockVideos) {
        violation = SPAM_VIOLATION_TYPE.VIDEO_BLOCKED;
        break;
      }
    }
  }

  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (!violation && mentionCount >= settings.antiSpamMentionLimit) {
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

// ── 부계정(알트) 의심 감지 - 메시지가 아니라 서버 입장(GuildMemberAdd) 시점에 본다 ──

function normalizeUsername(name: string): string {
  // 숫자/밑줄/점/하이픈을 떼어내면 "eme1", "eme_02", "eme.official" 같은 변형이
  // 전부 "eme"로 모여서, 서로 다른 사람이 우연히 겹칠 확률보다 같은 사람이 알트를
  // 팔 때 흔히 쓰는 패턴(기본 이름 + 숫자/구분자)을 잡아내는 쪽에 가중치를 둔다.
  return name
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s_\-.]/g, "")
    .replace(/\d+$/, "");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** "eme"/"eme1" 같은 패턴을 잡기 위한 유사도 비교 - 정규화 후 완전히 같거나, 짧은 이름 기준 1글자 이내 차이. */
function isSimilarUsername(a: string, b: string): boolean {
  const na = normalizeUsername(a);
  const nb = normalizeUsername(b);
  if (na.length < 3 || nb.length < 3) return false;
  if (na === nb) return true;
  return levenshtein(na, nb) <= 1;
}

/**
 * 새 멤버가 서버에 들어왔을 때 부계정(알트) 여부를 의심한다 - (1) 계정 생성일이
 * 너무 최근이거나 (2) 기존 멤버와 닉네임/유저명이 너무 비슷하면 의심 신호로 본다.
 * 둘 다 겹치면 바로 추방하고, 하나만 겹치면 관리자 로그에 "추방" 버튼과 함께 올려
 * 사람이 판단하게 한다 (신규 가입자를 오탐으로 잘못 추방하는 걸 막기 위함).
 */
export async function handleAntiSpamMemberJoin(member: GuildMember) {
  if (member.user.bot) return;
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.antiSpamEnabled) return;
  if (settings.antiSpamWhitelistRoleId && member.roles.cache.has(settings.antiSpamWhitelistRoleId)) return;

  const ageDays = (Date.now() - member.user.createdTimestamp) / (24 * 60 * 60 * 1000);
  const tooNew = settings.antiSpamAltAccountMinAgeDays > 0 && ageDays < settings.antiSpamAltAccountMinAgeDays;

  let similarTo: string | null = null;
  if (settings.antiSpamSimilarNameCheck) {
    const members = await member.guild.members.fetch().catch(() => null);
    if (members) {
      for (const [id, m] of members) {
        if (id === member.id || m.user.bot) continue;
        if (isSimilarUsername(member.user.username, m.user.username) || isSimilarUsername(member.displayName, m.displayName)) {
          similarTo = m.user.tag;
          break;
        }
      }
    }
  }

  if (!tooNew && !similarTo) return;

  const reasonParts = [
    tooNew ? `계정 생성 ${ageDays.toFixed(1)}일 전 (기준 ${settings.antiSpamAltAccountMinAgeDays}일 미만)` : null,
    similarTo ? `기존 멤버 "${similarTo}"와 유사한 이름` : null,
  ].filter((v): v is string => !!v);
  const reason = reasonParts.join(" · ");

  if (tooNew && similarTo) {
    // 두 신호가 겹치면 부계정일 확률이 높다고 보고 즉시 추방한다.
    await member.kick(`안티스팸: 부계정 의심 (${reason})`).catch(() => {});
  }

  if (!settings.antiSpamLogChannelId) return;
  const logChannel = await member.guild.channels.fetch(settings.antiSpamLogChannelId).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const row =
    tooNew && similarTo
      ? undefined
      : new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`antispam:kick:${member.id}`)
            .setLabel("🚫 추방")
            .setStyle(ButtonStyle.Danger)
        );

  await (logChannel as TextChannel)
    .send(
      buildPanel({
        title: tooNew && similarTo ? "🚫 부계정 의심 - 자동 추방됨" : "⚠️ 부계정 의심 - 확인 필요",
        accentColor: ERROR_ACCENT_COLOR,
        fields: [
          { name: "대상", value: `<@${member.id}> (${member.user.tag})` },
          { name: "의심 사유", value: reason },
        ],
        rows: row ? [row] : [],
      })
    )
    .catch(() => {});
}

/** 부계정 의심 로그의 "🚫 추방" 버튼. */
export async function handleAntiSpamKick(interaction: ButtonInteraction, userId: string) {
  await requireLinkedAdmin(interaction.user.id);
  const guild = interaction.guild;
  if (!guild) return interaction.reply(ephemeral(panelError("서버 안에서만 사용할 수 있습니다.")));

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return interaction.reply(ephemeral(panelError("이미 서버에 없는 사용자입니다.")));

  await member.kick("안티스팸: 관리자가 부계정 의심으로 추방").catch(() => {});
  await interaction.reply(ephemeral(panelSuccess(`${member.user.tag}님을 추방했습니다.`)));
}
