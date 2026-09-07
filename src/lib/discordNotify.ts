// 디스코드 게이트웨이(상시 접속)가 필요 없는, REST API만 사용하는 가벼운 DM 발송 유틸.
// 웹사이트(Next.js 서버 액션)와 봇 프로세스 양쪽에서 공통으로 호출한다.
// 봇 토큰이 없거나 전송이 실패해도 "구매 자체"에는 영향을 주지 않도록 항상 조용히 무시한다
// (예: 사용자가 DM을 막아둔 경우, 봇이 아직 설정되지 않은 경우).

import { prisma } from "@/lib/prisma";
import { readUploadedFile, isUploadKey } from "@/lib/storage";
import { PURCHASE_TIER_ROLES, ORDER_STATUS } from "@/lib/constants";

const API_BASE = "https://discord.com/api/v10";

type EmbedField = { name: string; value: string; inline?: boolean };
type SimpleEmbed = {
  title?: string;
  description?: string;
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

export async function sendDiscordDM(
  discordId: string,
  payload: { content?: string; embeds?: SimpleEmbed[] },
  attachment?: { buffer: Buffer; fileName: string }
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  try {
    const channelId = await openDmChannel(token, discordId);
    if (!channelId) return;

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

    await fetch(`${API_BASE}/channels/${channelId}/messages`, { method: "POST", headers, body });
  } catch {
    // 네트워크 오류 등은 무시 - DM은 부가 기능이지 핵심 트랜잭션이 아니다.
  }
}

/** 특정 채널에 임베드를 직접 게시한다 (DM이 아니라 서버 채널용). */
export async function sendChannelMessage(channelId: string, payload: { content?: string; embeds?: SimpleEmbed[] }) {
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

/** 구매(랜덤 지급) 완료 시, 연동된 디스코드 계정으로 결과를 DM으로 보낸다. */
export async function notifyPurchaseByDM(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.discordId) return;

  const order = await prisma.order.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { tier: true, artwork: true },
  });
  if (!order || !order.artwork) return;

  const embed: SimpleEmbed = {
    title: `🎉 주문 #${order.orderNo} 완료`,
    description: `**${order.tier.name}** 구매가 완료되어 계정이 지급되었습니다.`,
    color: BRAND_COLOR,
    fields: [
      { name: "결제 금액", value: `${order.finalAmount.toLocaleString()}P`, inline: true },
      { name: "지급된 계정", value: order.artwork.title, inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  if (!isUploadKey(order.artwork.fileKey)) {
    // 파일 업로드가 아니라 텍스트/링크로 등록된 재고 - 그 내용 자체가 지급물이다.
    embed.fields!.push({ name: "지급 내용", value: order.artwork.fileKey });
    await sendDiscordDM(user.discordId, { embeds: [embed] });
    return;
  }

  try {
    const buffer = await readUploadedFile(order.artwork.fileKey);
    const ext = order.artwork.fileKey.split(".").pop() || "png";
    await sendDiscordDM(user.discordId, { embeds: [embed] }, { buffer, fileName: `${order.artwork.code}.${ext}` });
  } catch {
    await sendDiscordDM(user.discordId, { embeds: [embed] });
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
