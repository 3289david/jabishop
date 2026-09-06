// 디스코드 게이트웨이(상시 접속)가 필요 없는, REST API만 사용하는 가벼운 DM 발송 유틸.
// 웹사이트(Next.js 서버 액션)와 봇 프로세스 양쪽에서 공통으로 호출한다.
// 봇 토큰이 없거나 전송이 실패해도 "구매 자체"에는 영향을 주지 않도록 항상 조용히 무시한다
// (예: 사용자가 DM을 막아둔 경우, 봇이 아직 설정되지 않은 경우).

import { prisma } from "@/lib/prisma";
import { readUploadedFile } from "@/lib/storage";

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

const BRAND_COLOR = 0x6366f1;

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
    description: `**${order.tier.name}** 구매가 완료되어 그림이 지급되었습니다.`,
    color: BRAND_COLOR,
    fields: [
      { name: "결제 금액", value: `${order.finalAmount.toLocaleString()}P`, inline: true },
      { name: "지급된 그림", value: order.artwork.title, inline: true },
      { name: "희귀도", value: "★".repeat(order.artwork.rarityStars), inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  try {
    const buffer = await readUploadedFile(order.artwork.fileKey);
    const ext = order.artwork.fileKey.split(".").pop() || "png";
    await sendDiscordDM(user.discordId, { embeds: [embed] }, { buffer, fileName: `${order.artwork.code}.${ext}` });
  } catch {
    await sendDiscordDM(user.discordId, { embeds: [embed] });
  }
}
