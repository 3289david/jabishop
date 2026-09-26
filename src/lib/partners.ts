import { prisma } from "@/lib/prisma";
import { PARTNER_STATUS } from "@/lib/constants";
import {
  notifyAdminsNewPendingItem,
  createGuildTextChannel,
  addGuildMemberRole,
  sendDiscordDM,
} from "@/lib/discordNotify";

export class PartnerError extends Error {}

const DEFAULT_PARTNER_EMOJI = "🤝";

/** 요청하신 "┆◞꒰이모지︰이름◞" 형태의 꾸밈 채널명을 만든다. */
function buildPartnerChannelName(name: string, emoji: string | null): string {
  return `┆◞꒰${emoji || DEFAULT_PARTNER_EMOJI}︰${name}◞`;
}

export async function requestPartner(params: {
  discordUserId: string;
  discordTag: string;
  name: string;
  emoji?: string;
  description?: string;
  webhookUrl: string;
}) {
  const { discordUserId, discordTag, name, emoji, description, webhookUrl } = params;

  if (!webhookUrl || !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    throw new PartnerError("웹훅 URL은 필수입니다. https://discord.com/api/webhooks/... 형태로 입력해주세요.");
  }

  const existing = await prisma.partner.findUnique({ where: { discordUserId } });
  if (existing && existing.status === PARTNER_STATUS.PENDING) {
    throw new PartnerError("이미 심사 대기 중인 파트너 신청이 있습니다.");
  }
  if (existing && existing.status === PARTNER_STATUS.APPROVED) {
    throw new PartnerError("이미 파트너로 승인된 계정입니다.");
  }

  const partner = existing
    ? await prisma.partner.update({
        where: { id: existing.id },
        data: {
          name,
          emoji: emoji ?? null,
          description: description ?? null,
          webhookUrl: webhookUrl ?? null,
          status: PARTNER_STATUS.PENDING,
          adminNote: null,
          processedByAdminId: null,
          processedAt: null,
        },
      })
    : await prisma.partner.create({
        data: {
          discordUserId,
          discordTag,
          name,
          emoji: emoji ?? null,
          description: description ?? null,
          webhookUrl: webhookUrl ?? null,
        },
      });

  notifyAdminsNewPendingItem(
    "파트너 신청",
    `**${name}** (${discordTag})${description ? `\n소개: ${description}` : ""}${webhookUrl ? "\n웹훅 URL 등록됨" : "\n웹훅 URL 없음"}`
  ).catch(() => {});

  return partner;
}

/** 파트너 카테고리 밑에 채널 생성 + 역할 지급 - 승인(approvePartner)과 관리자 직접생성(adminCreatePartner)이 공용으로 쓴다. */
async function provisionPartnerChannelAndRole(discordUserId: string, name: string, emoji: string | null) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new PartnerError("DISCORD_GUILD_ID가 설정되지 않았습니다.");

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });

  let channelId: string | null = null;
  if (settings?.partnerCategoryId) {
    const channelName = buildPartnerChannelName(name, emoji);
    channelId = await createGuildTextChannel(guildId, channelName, settings.partnerCategoryId, discordUserId);
  }

  let roleGranted = false;
  if (settings?.partnerRoleId) {
    roleGranted = await addGuildMemberRole(guildId, discordUserId, settings.partnerRoleId);
  }

  return { channelId, roleGranted };
}

/** 파트너 신청을 승인한다: 파트너 카테고리 밑에 채널 생성 + 역할 지급. */
export async function approvePartner(partnerId: string, adminId: string) {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PartnerError("존재하지 않는 파트너 신청입니다.");
  if (partner.status !== PARTNER_STATUS.PENDING) throw new PartnerError("이미 처리된 신청입니다.");

  const { channelId, roleGranted } = await provisionPartnerChannelAndRole(partner.discordUserId, partner.name, partner.emoji);

  await prisma.partner.update({
    where: { id: partnerId },
    data: {
      status: PARTNER_STATUS.APPROVED,
      channelId,
      processedByAdminId: adminId,
      processedAt: new Date(),
    },
  });

  sendDiscordDM(partner.discordUserId, {
    embeds: [
      {
        title: "🤝 파트너 승인 완료",
        description: [
          `**${partner.name}** 파트너 신청이 승인되었습니다.`,
          channelId ? `<#${channelId}> 채널이 생성되었습니다.` : null,
          "파트너 안내 패널의 [⚙️ 내 파트너 정보 관리] 버튼에서 웹훅 등록 등 정보를 직접 관리할 수 있습니다.",
        ]
          .filter(Boolean)
          .join("\n"),
        color: 0x22c55e,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});

  return { channelId, roleGranted };
}

/**
 * 관리자가 신청/승인 절차 없이 특정 유저를 바로 파트너로 등록한다 (채널 생성 + 역할 지급까지 즉시 처리).
 * 자가 신청(requestPartner)과 달리 웹훅 URL이 필수가 아니며, 이미 REJECTED 상태였던 유저도 다시 등록할 수 있다.
 * 이미 APPROVED인 유저만 막는다 (한 디스코드 계정당 파트너 레코드는 하나뿐이므로, 중복 승인을 방지).
 */
export async function adminCreatePartner(params: {
  discordUserId: string;
  discordTag: string;
  name: string;
  emoji?: string;
  description?: string;
  webhookUrl?: string;
  adminId: string;
}) {
  const { discordUserId, discordTag, name, emoji, description, webhookUrl, adminId } = params;

  if (webhookUrl && !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    throw new PartnerError("웹훅 URL 형식이 올바르지 않습니다. https://discord.com/api/webhooks/... 형태여야 합니다.");
  }

  const existing = await prisma.partner.findUnique({ where: { discordUserId } });
  if (existing && existing.status === PARTNER_STATUS.APPROVED) {
    throw new PartnerError("이미 파트너로 승인된 계정입니다.");
  }

  const { channelId, roleGranted } = await provisionPartnerChannelAndRole(discordUserId, name, emoji ?? null);

  const partner = existing
    ? await prisma.partner.update({
        where: { id: existing.id },
        data: {
          discordTag,
          name,
          emoji: emoji ?? null,
          description: description ?? null,
          webhookUrl: webhookUrl ?? null,
          status: PARTNER_STATUS.APPROVED,
          channelId,
          adminNote: null,
          processedByAdminId: adminId,
          processedAt: new Date(),
        },
      })
    : await prisma.partner.create({
        data: {
          discordUserId,
          discordTag,
          name,
          emoji: emoji ?? null,
          description: description ?? null,
          webhookUrl: webhookUrl ?? null,
          status: PARTNER_STATUS.APPROVED,
          channelId,
          processedByAdminId: adminId,
          processedAt: new Date(),
        },
      });

  sendDiscordDM(discordUserId, {
    embeds: [
      {
        title: "🤝 파트너 등록 완료",
        description: [
          `관리자에 의해 **${name}** 파트너로 등록되었습니다.`,
          channelId ? `<#${channelId}> 채널이 생성되었습니다.` : null,
          "파트너 안내 패널의 [⚙️ 내 파트너 정보 관리] 버튼에서 웹훅/홍보 문구 등록 등 정보를 직접 관리할 수 있습니다.",
        ]
          .filter(Boolean)
          .join("\n"),
        color: 0x22c55e,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});

  return { partner, channelId, roleGranted };
}

export async function rejectPartner(partnerId: string, adminId: string, note?: string) {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PartnerError("존재하지 않는 파트너 신청입니다.");
  if (partner.status !== PARTNER_STATUS.PENDING) throw new PartnerError("이미 처리된 신청입니다.");

  await prisma.partner.update({
    where: { id: partnerId },
    data: { status: PARTNER_STATUS.REJECTED, adminNote: note, processedByAdminId: adminId, processedAt: new Date() },
  });

  sendDiscordDM(partner.discordUserId, {
    embeds: [
      {
        title: "파트너 신청 반려",
        description: note ? `파트너 신청이 반려되었습니다: ${note}` : "파트너 신청이 반려되었습니다.",
        color: 0xef4444,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});
}

/** 승인된 파트너 본인이 파트너 패널의 "웹훅 등록/수정" 버튼으로 자기 웹훅 URL을 직접 바꾼다. */
export async function updatePartnerWebhook(discordUserId: string, webhookUrl: string) {
  const partner = await prisma.partner.findUnique({ where: { discordUserId } });
  if (!partner || partner.status !== PARTNER_STATUS.APPROVED) {
    throw new PartnerError("승인된 파트너만 웹훅을 등록할 수 있습니다.");
  }
  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    throw new PartnerError("웹훅 URL 형식이 올바르지 않습니다.");
  }
  await prisma.partner.update({ where: { id: partner.id }, data: { webhookUrl } });
}

/** 승인된 파트너 본인이 자기 채널에 매일 게시될 홍보 문구를 직접 등록/수정한다. */
export async function updatePartnerPromoMessage(discordUserId: string, promoMessage: string) {
  const partner = await prisma.partner.findUnique({ where: { discordUserId } });
  if (!partner || partner.status !== PARTNER_STATUS.APPROVED) {
    throw new PartnerError("승인된 파트너만 홍보 문구를 등록할 수 있습니다.");
  }
  if (!partner.channelId) {
    throw new PartnerError("파트너 채널이 없어 홍보 문구를 게시할 곳이 없습니다. 관리자에게 문의해주세요.");
  }
  await prisma.partner.update({ where: { id: partner.id }, data: { promoMessage } });
}
