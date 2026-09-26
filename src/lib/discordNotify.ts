// 디스코드 게이트웨이(상시 접속)가 필요 없는, REST API만 사용하는 가벼운 DM 발송 유틸.
// 웹사이트(Next.js 서버 액션)와 봇 프로세스 양쪽에서 공통으로 호출한다.
// 봇 토큰이 없거나 전송이 실패해도 "구매 자체"에는 영향을 주지 않도록 항상 조용히 무시한다
// (예: 사용자가 DM을 막아둔 경우, 봇이 아직 설정되지 않은 경우).

import { prisma } from "@/lib/prisma";
import { readUploadedFile, isUploadKey } from "@/lib/storage";
import { PURCHASE_TIER_ROLES, ORDER_STATUS } from "@/lib/constants";
import { getAppOrigin } from "@/lib/appUrl";

const API_BASE = "https://discord.com/api/v10";

type EmbedField = { name: string; value: string; inline?: boolean };
type SimpleEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: EmbedField[];
  image?: { url: string };
  timestamp?: string;
};

async function openDmChannel(token: string, discordId: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/users/@me/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordId }),
  });
  if (!res.ok) return null;
  const channel = (await res.json()) as { id: string };
  return channel.id;
}

/**
 * DM 발송을 시도하고 성공 여부를 반환한다. 사용자가 "서버 멤버의 DM 허용"을 꺼두었거나
 * 봇을 차단한 경우 디스코드가 메시지 전송 자체를 거부하는데(403 등), 예전에는 이걸
 * 조용히 무시해서 "일부 회원에게만 DM이 안 온다"는 게 서버 로그에도 전혀 안 남는
 * 문제가 있었다. 이제는 실패를 로그로 남기고 호출한 쪽에 boolean으로 알려줘서,
 * 관리자 지급처럼 DM이 유일한 통지 수단인 곳에서 실패를 인지하고 안내할 수 있게 한다.
 */
export async function sendDiscordDM(
  discordId: string,
  payload: { content?: string; embeds?: SimpleEmbed[] },
  attachment?: { buffer: Buffer; fileName: string }
): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return false;

  try {
    const channelId = await openDmChannel(token, discordId);
    if (!channelId) {
      console.warn(`디스코드 DM 채널 생성 실패 (user=${discordId}) - DM을 차단했거나 서버 공유가 없을 수 있습니다.`);
      return false;
    }

    let body: BodyInit;
    let headers: Record<string, string>;

    if (attachment) {
      const embeds = (payload.embeds ?? []).map((e, i) =>
        i === 0 ? { ...e, image: { url: `attachment://${attachment.fileName}` } } : e
      );
      const form = new FormData();
      form.append("payload_json", JSON.stringify({ ...payload, embeds }));
      form.append("files[0]", new Blob([new Uint8Array(attachment.buffer)]), attachment.fileName);
      body = form;
      headers = { Authorization: `Bot ${token}` };
    } else {
      body = JSON.stringify(payload);
      headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
    }

    const res = await fetch(`${API_BASE}/channels/${channelId}/messages`, { method: "POST", headers, body });
    if (!res.ok) {
      console.warn(`디스코드 DM 발송 실패 (user=${discordId}, status=${res.status}) - 서버 멤버 DM 허용을 꺼뒀거나 봇을 차단했을 수 있습니다.`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`디스코드 DM 발송 중 오류 (user=${discordId}):`, e);
    return false;
  }
}

/** 특정 채널에 임베드(+버튼 등 컴포넌트)를 직접 게시한다 (DM이 아니라 서버 채널용). */
export async function sendChannelMessage(
  channelId: string,
  // components는 Discord Message Components 원본 스키마를 그대로 받는다 (discord.js 빌더가 필요 없는
  // 공용 lib 코드라 discord.js 타입에 의존하지 않기 위해 unknown[]로 느슨하게 받는다).
  payload: { content?: string; embeds?: SimpleEmbed[]; components?: unknown[] }
) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${API_BASE}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // 채널이 삭제됐거나 권한이 없는 경우 등 - 구매 자체는 계속 진행돼야 하므로 무시한다.
  }
}

const BRAND_COLOR = 0x6366f1;

/** 구매 완료 시 관리자가 설정한 "구매 로그" 채널에 공개적으로 알린다. */
export async function announcePurchaseInChannel(userId: string, orderId: string) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.discordPurchaseLogChannelId) return;

  const [user, order] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.order.findUnique({ where: { id: orderId }, include: { tier: true } }),
  ]);
  if (!order) return;

  const name = user?.name ?? "익명";
  await sendChannelMessage(settings.discordPurchaseLogChannelId, {
    embeds: [
      {
        description: `🎉 **${name}**님이 **${order.tier.name}**을(를) 구매했습니다!`,
        color: BRAND_COLOR,
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/** 해당 사용자의 누적 구매금액(환불 제외, 포인트 결제 완료 기준)을 계산한다. */
export async function getCumulativeSpend(userId: string): Promise<number> {
  const result = await prisma.order.aggregate({
    where: { userId, status: ORDER_STATUS.COMPLETED },
    _sum: { finalAmount: true },
  });
  return result._sum.finalAmount ?? 0;
}

/**
 * 누적 구매금액 등급에 해당하는 디스코드 역할을 부여한다. 상위 등급을 달성해도
 * 이전 등급 역할은 "달성 배지"로 유지하고 제거하지 않는다 (10,000원 이상 배지 등).
 */
export async function syncPurchaseTierRoles(discordId: string, cumulativeSpend: number) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return;

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings) return;

  for (const tier of PURCHASE_TIER_ROLES) {
    if (cumulativeSpend < tier.threshold) continue;
    const roleId = settings[tier.settingKey as keyof typeof settings] as string | null;
    if (!roleId) continue;

    try {
      await fetch(`${API_BASE}/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
        method: "PUT",
        headers: { Authorization: `Bot ${token}` },
      });
    } catch {
      // 권한 부족(봇 역할이 대상 역할보다 낮음) 등은 조용히 무시 - 구매 자체엔 영향 없음.
    }
  }
}

/**
 * 구매(랜덤 지급) 완료 시, 연동된 디스코드 계정으로 결과를 DM으로 보낸다.
 * orderId를 지정하면 그 주문을 정확히 대상으로 하고(관리자 지급/교환 재발송 등에 사용),
 * 생략하면 기존처럼 그 사용자의 가장 최근 주문을 사용한다.
 */
export async function notifyPurchaseByDM(
  userId: string,
  orderId?: string,
  override?: { title?: string; description?: string }
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.discordId) return false;

  const order = orderId
    ? await prisma.order.findUnique({ where: { id: orderId }, include: { tier: true, artwork: true } })
    : await prisma.order.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { tier: true, artwork: true },
      });
  if (!order || !order.artwork) return false;

  const mypageUrl = `${getAppOrigin()}/mypage/orders/${order.id}`;

  const embed: SimpleEmbed = {
    title: override?.title ?? `🎉 주문 #${order.orderNo} 완료`,
    description: override?.description ?? `**${order.tier.name}** 구매가 완료되어 계정이 지급되었습니다.`,
    url: mypageUrl,
    color: BRAND_COLOR,
    fields: [
      { name: "결제 금액", value: `${order.finalAmount.toLocaleString()}P`, inline: true },
      { name: "지급된 계정", value: order.artwork.title, inline: true },
      { name: "마이페이지에서 보기", value: mypageUrl },
    ],
    timestamp: new Date().toISOString(),
  };

  if (!isUploadKey(order.artwork.fileKey)) {
    // 파일 업로드가 아니라 텍스트/링크로 등록된 재고 - 그 내용 자체가 지급물이다.
    embed.fields!.push({ name: "지급 내용", value: order.artwork.fileKey });
    return sendDiscordDM(user.discordId, { embeds: [embed] });
  }

  try {
    const buffer = await readUploadedFile(order.artwork.fileKey);
    const ext = order.artwork.fileKey.split(".").pop() || "png";
    return await sendDiscordDM(user.discordId, { embeds: [embed] }, { buffer, fileName: `${order.artwork.code}.${ext}` });
  } catch {
    return sendDiscordDM(user.discordId, { embeds: [embed] });
  }
}

/** 디스코드 계정이 연동된 모든 활성 관리자에게 DM을 보낸다 (승인 대기 항목 발생 등). */
export async function notifyAllAdmins(embed: SimpleEmbed): Promise<void> {
  const admins = await prisma.adminUser.findMany({
    where: { discordId: { not: null }, status: "ACTIVE" },
    select: { discordId: true },
  });
  await Promise.all(
    admins.map((a) => (a.discordId ? sendDiscordDM(a.discordId, { embeds: [embed] }) : Promise.resolve()))
  );
}

const LOW_STOCK_THRESHOLD = 3;

/**
 * 구매로 재고가 하나 줄어든 직후 호출한다. 남은 재고가 LOW_STOCK_THRESHOLD(품절 임박) 또는
 * 0(품절)에 "정확히" 도달한 순간에만 관리자에게 알림을 보내, 낮은 재고 상태가 계속돼도
 * 판매될 때마다 반복 알림이 오지 않게 한다.
 */
export async function notifyLowStockIfNeeded(tierId: string, remainingStock: number) {
  if (remainingStock !== 0 && remainingStock !== LOW_STOCK_THRESHOLD) return;

  const tier = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!tier) return;

  const embed: SimpleEmbed =
    remainingStock === 0
      ? {
          title: "🚨 재고 품절",
          description: `**${tier.name}** 등급의 계정 재고가 모두 소진되었습니다. 새 재고를 등록하거나 등급을 숨김 처리해주세요.`,
          color: 0xef4444,
          timestamp: new Date().toISOString(),
        }
      : {
          title: "⚠️ 재고 부족 임박",
          description: `**${tier.name}** 등급의 남은 재고가 ${LOW_STOCK_THRESHOLD}개입니다. 미리 계정을 추가 등록해주세요.`,
          color: 0xf59e0b,
          timestamp: new Date().toISOString(),
        };

  await notifyAllAdmins(embed);
}

/** 관리자 처리가 필요한 새 항목(충전신청/환불신청/문의/신고)이 생겼을 때 알린다. */
export async function notifyAdminsNewPendingItem(kind: string, summary: string) {
  await notifyAllAdmins({
    title: `📥 새 ${kind} 접수`,
    description: summary,
    color: BRAND_COLOR,
    timestamp: new Date().toISOString(),
  });
}

/** 특정 카테고리 밑에 텍스트 채널을 만들고, 지정한 사용자에게 그 채널을 볼 수 있는 권한을 명시적으로 준다. */
export async function createGuildTextChannel(
  guildId: string,
  name: string,
  categoryId: string | null,
  viewerDiscordId?: string
): Promise<string | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;

  // 이모지/꾸밈 기호(┆◞꒰︰ 등)는 그대로 허용하고, 공백만 하이픈으로 바꾸고
  // 제어 문자만 제거한다 (Discord 채널명은 유니코드/이모지를 지원한다).
  const safeName =
    name
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[\x00-\x1F\x7F]/g, "")
      .slice(0, 90) || "partner";

  try {
    const res = await fetch(`${API_BASE}/guilds/${guildId}/channels`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: safeName,
        type: 0, // GUILD_TEXT
        parent_id: categoryId || undefined,
        permission_overwrites: viewerDiscordId
          ? [
              {
                id: viewerDiscordId,
                type: 1, // member
                allow: String(1024 | 2048 | 65536), // VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY
              },
            ]
          : undefined,
      }),
    });
    if (!res.ok) return null;
    const channel = (await res.json()) as { id: string };
    return channel.id;
  } catch {
    return null;
  }
}

/** 특정 길드 멤버에게 역할을 부여한다. */
export async function addGuildMemberRole(guildId: string, discordUserId: string, roleId: string): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 디스코드 웹훅 URL로 텍스트 메시지를 보낸다 (봇 토큰 불필요 - 웹훅 자체가 인증 수단). */
export async function sendWebhookMessage(webhookUrl: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
