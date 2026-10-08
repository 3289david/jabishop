import { prisma } from "@/lib/prisma";
import { SELLER_STATUS, SELLER_TICKET_STATUS, STICKY_KIND } from "@/lib/constants";
import type { Seller } from "@prisma/client";
import {
  notifyAdminsNewPendingItem,
  sendDiscordDM,
  createPlainGuildChannel,
  createPrivateGuildChannel,
  deleteGuildChannel,
  addGuildMemberRole,
  removeGuildMemberRole,
  setChannelMemberOverwrite,
} from "@/lib/discordNotify";

export class SellerError extends Error {}

// VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY
const SELLER_CHANNEL_ACTIVE_ALLOW = 1024 | 2048 | 65536;
// 정지/만료 시에는 "읽기 전용"으로만 바꾼다 - 채널 자체(과거 거래 내역/상품 목록)는
// 그대로 보존하고, 새 글만 못 쓰게 막는다.
const SELLER_CHANNEL_READONLY_ALLOW = 1024 | 65536;
const SELLER_CHANNEL_READONLY_DENY = 2048;

function buildStoreChannelName(storeName: string): string {
  return `🏪${storeName}`;
}

function buildManageChannelName(storeName: string): string {
  return `🔧${storeName}-관리`;
}

// 관리 패널 메시지는 discord.js의 EmbedBuilder/ButtonBuilder를 안 쓰고 디스코드 API가
// 그대로 받는 순수 JSON으로 직접 만든다 - 이 파일(src/lib/sellers.ts)은 관리자
// 웹페이지(src/lib/actions/adminSellers.ts)에서도 호출되는데, "discord.js"를 import하면
// 그 안의 게이트웨이(@discordjs/ws) 등 봇 전용 의존성까지 웹 번들에 끌려들어가
// 빌드가 깨진다. 버튼을 눌렀을 때의 실시간 갱신(src/bot/sellerPanelHandlers.ts)은
// 봇 프로세스 안에서만 돌기 때문에 거기서는 discord.js 빌더를 그대로 써도 안전하다.
function buildSellerManagePanelPayload(seller: Seller) {
  const avg = seller.ratingCount > 0 ? (seller.ratingSum / seller.ratingCount).toFixed(1) : "-";
  return {
    embeds: [
      {
        title: `🏪 ${seller.storeName} 관리 패널`,
        color: 0x6366f1,
        timestamp: new Date().toISOString(),
        fields: [
          { name: "상태", value: seller.status, inline: true },
          { name: "평점", value: `⭐ ${avg} (${seller.ratingCount}개)`, inline: true },
          { name: "거래완료", value: `${seller.dealCount}건`, inline: true },
          {
            name: "다음 결제일",
            value: seller.nextBillingAt ? seller.nextBillingAt.toLocaleDateString("ko-KR") : "-",
            inline: true,
          },
          { name: "쇼룸 채널", value: seller.channelId ? `<#${seller.channelId}>` : "-", inline: true },
        ],
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, custom_id: "sellerpanel:newproduct", label: "🛒 상품 등록", style: 1 },
          { type: 2, custom_id: "sellerpanel:products", label: "📦 내 상품 관리", style: 2 },
          { type: 2, custom_id: "sellerpanel:tickets", label: "🎫 진행 중인 문의", style: 2 },
        ],
      },
      {
        type: 1,
        components: [
          { type: 2, custom_id: "sellerpanel:stats", label: "📊 통계 보기", style: 2 },
          { type: 2, custom_id: "sellerpanel:editinfo", label: "⚙️ 상점 정보 수정", style: 2 },
        ],
      },
    ],
  };
}

/** 판매자 입점 신청. 관리자 승인 전까지는 아무 권한도 생기지 않는다. */
export async function applySeller(params: {
  discordUserId: string;
  discordTag: string;
  storeName: string;
  category?: string;
  saleMethod?: string;
  description?: string;
}) {
  const { discordUserId, discordTag, storeName, category, saleMethod, description } = params;

  const existing = await prisma.seller.findUnique({ where: { discordUserId } });
  if (existing && existing.status === SELLER_STATUS.PENDING) {
    throw new SellerError("이미 심사 대기 중인 판매자 신청이 있습니다.");
  }
  if (existing && (existing.status === SELLER_STATUS.ACTIVE || existing.status === SELLER_STATUS.SUSPENDED)) {
    throw new SellerError("이미 입점한 판매자입니다.");
  }

  const seller = existing
    ? await prisma.seller.update({
        where: { id: existing.id },
        data: {
          storeName,
          category: category ?? null,
          saleMethod: saleMethod ?? null,
          description: description ?? null,
          status: SELLER_STATUS.PENDING,
          adminNote: null,
          processedByAdminId: null,
          processedAt: null,
        },
      })
    : await prisma.seller.create({
        data: { discordUserId, discordTag, storeName, category, saleMethod, description },
      });

  notifyAdminsNewPendingItem(
    "판매자 입점 신청",
    `**${storeName}** (${discordTag})${category ? `\n카테고리: ${category}` : ""}${saleMethod ? `\n판매 방식: ${saleMethod}` : ""}${description ? `\n소개: ${description}` : ""}`
  ).catch(() => {});

  return seller;
}

/**
 * 입점 승인: 판매자 쇼룸 채널을 만들고(공개 열람, 판매자만 글쓰기) 판매자 역할을 지급한다.
 * 첫 달은 ShopSetting.sellerFreeTrialDays만큼 무료로 시작한다.
 */
export async function approveSeller(sellerId: string, adminId: string, guildId: string) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw new SellerError("존재하지 않는 판매자 신청입니다.");
  if (seller.status !== SELLER_STATUS.PENDING) throw new SellerError("이미 처리된 신청입니다.");

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.sellerCategoryId) {
    throw new SellerError("판매자 시스템이 아직 설치되지 않았습니다. 먼저 /판매자시스템설치를 실행해주세요.");
  }

  const channelId = await createPlainGuildChannel(guildId, buildStoreChannelName(seller.storeName), settings.sellerCategoryId);
  if (channelId) {
    // 쇼룸은 누구나 볼 수 있어야 하지만 글은 판매자 본인만 쓸 수 있어야 한다.
    await setChannelMemberOverwrite(channelId, seller.discordUserId, SELLER_CHANNEL_ACTIVE_ALLOW, 0);
  }
  // 관리 패널은 쇼룸(공개 진열대)과 분리된, 판매자 본인만 볼 수 있는 완전 비공개 채널에 둔다.
  const manageChannelId = settings.sellerManageCategoryId
    ? await createPrivateGuildChannel(guildId, buildManageChannelName(seller.storeName), settings.sellerManageCategoryId, [
        seller.discordUserId,
      ])
    : null;
  if (settings.sellerRoleId) {
    await addGuildMemberRole(guildId, seller.discordUserId, settings.sellerRoleId);
  }

  const now = new Date();
  const freeTrialDays = settings.sellerFreeTrialDays ?? 30;
  const nextBillingAt = new Date(now.getTime() + freeTrialDays * 24 * 60 * 60 * 1000);

  const updated = await prisma.seller.update({
    where: { id: sellerId },
    data: {
      status: SELLER_STATUS.ACTIVE,
      channelId,
      manageChannelId,
      startedAt: now,
      nextBillingAt,
      lastReminderDays: null,
      expiredAt: null,
      processedByAdminId: adminId,
      processedAt: now,
    },
  });

  // 관리 패널(상품 등록/내 상품 관리/진행 중인 문의/통계/정보수정 버튼)을 비공개 관리
  // 채널 맨 아래에 고정 메시지로 올려둔다 - 기존 고정 메시지 로직
  // (src/bot/stickyMessage.ts)이 그 채널에서 다른 메시지가 쌓여도 자동으로 맨 아래로
  // 다시 올려준다.
  if (manageChannelId) {
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${manageChannelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildSellerManagePanelPayload(updated)),
      });
      if (res.ok) {
        const message = (await res.json()) as { id: string };
        await prisma.stickyMessage.create({
          data: { channelId: manageChannelId, kind: STICKY_KIND.SELLER_PANEL, messageId: message.id, createdByAdminId: adminId },
        });
      }
    } catch {
      // 패널 게시에 실패해도 승인 자체는 완료된 상태이므로 조용히 무시한다 (판매자는
      // /판매자통계로도 동일한 관리 버튼에 접근할 수 있다).
    }
  }

  sendDiscordDM(seller.discordUserId, {
    embeds: [
      {
        title: "🏪 판매자 입점 승인 완료",
        description: [
          `**${seller.storeName}** 입점이 승인되었습니다!`,
          channelId ? `<#${channelId}> 쇼룸 채널이 생성되었습니다 (구매자에게 공개).` : null,
          manageChannelId ? `<#${manageChannelId}> 관리 채널이 생성되었습니다 (본인만 보임) - 여기서 상품 등록/통계/문의 확인을 할 수 있습니다.` : null,
          `첫 ${freeTrialDays}일은 무료입니다 (다음 결제일: ${nextBillingAt.toLocaleDateString("ko-KR")}).`,
        ]
          .filter(Boolean)
          .join("\n"),
        color: 0x22c55e,
        timestamp: now.toISOString(),
      },
    ],
  }).catch(() => {});

  return updated;
}

export async function rejectSeller(sellerId: string, adminId: string, note?: string) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw new SellerError("존재하지 않는 판매자 신청입니다.");
  if (seller.status !== SELLER_STATUS.PENDING) throw new SellerError("이미 처리된 신청입니다.");

  await prisma.seller.update({
    where: { id: sellerId },
    data: { status: SELLER_STATUS.REJECTED, adminNote: note, processedByAdminId: adminId, processedAt: new Date() },
  });

  sendDiscordDM(seller.discordUserId, {
    embeds: [
      {
        title: "판매자 입점 신청 거절",
        description: note ? `입점 신청이 거절되었습니다: ${note}` : "입점 신청이 거절되었습니다.",
        color: 0xef4444,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});
}

/** 쇼룸 채널을 읽기 전용으로 바꾼다 (정지/만료 공용). 채널/상품/거래 내역은 그대로 보존. */
async function lockSellerChannel(seller: { channelId: string | null; discordUserId: string }) {
  if (!seller.channelId) return;
  await setChannelMemberOverwrite(seller.channelId, seller.discordUserId, SELLER_CHANNEL_READONLY_ALLOW, SELLER_CHANNEL_READONLY_DENY);
}

async function unlockSellerChannel(seller: { channelId: string | null; discordUserId: string }) {
  if (!seller.channelId) return;
  await setChannelMemberOverwrite(seller.channelId, seller.discordUserId, SELLER_CHANNEL_ACTIVE_ALLOW, 0);
}

export async function suspendSeller(sellerId: string, adminId: string, guildId: string, note?: string) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw new SellerError("존재하지 않는 판매자입니다.");
  if (seller.status !== SELLER_STATUS.ACTIVE) throw new SellerError("활성 상태인 판매자만 정지할 수 있습니다.");

  await lockSellerChannel(seller);
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (settings?.sellerRoleId) await removeGuildMemberRole(guildId, seller.discordUserId, settings.sellerRoleId);

  await prisma.seller.update({
    where: { id: sellerId },
    data: { status: SELLER_STATUS.SUSPENDED, adminNote: note, processedByAdminId: adminId, processedAt: new Date() },
  });

  sendDiscordDM(seller.discordUserId, {
    embeds: [
      {
        title: "🚨 판매자 활동 정지",
        description: note ? `판매 활동이 정지되었습니다: ${note}` : "판매 활동이 정지되었습니다.",
        color: 0xef4444,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});
}

export async function restoreSeller(sellerId: string, adminId: string, guildId: string) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw new SellerError("존재하지 않는 판매자입니다.");
  if (seller.status !== SELLER_STATUS.SUSPENDED && seller.status !== SELLER_STATUS.EXPIRED) {
    throw new SellerError("정지 또는 만료 상태인 판매자만 복구할 수 있습니다.");
  }

  await unlockSellerChannel(seller);
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (settings?.sellerRoleId) await addGuildMemberRole(guildId, seller.discordUserId, settings.sellerRoleId);

  const now = new Date();
  const nextBillingAt =
    seller.status === SELLER_STATUS.EXPIRED ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : seller.nextBillingAt;

  await prisma.seller.update({
    where: { id: sellerId },
    data: {
      status: SELLER_STATUS.ACTIVE,
      nextBillingAt,
      lastReminderDays: null,
      expiredAt: null,
      processedByAdminId: adminId,
      processedAt: now,
    },
  });

  sendDiscordDM(seller.discordUserId, {
    embeds: [{ title: "✅ 판매자 활동 복구", description: "판매 활동이 다시 활성화되었습니다.", color: 0x22c55e, timestamp: now.toISOString() }],
  }).catch(() => {});
}

/** 완전 퇴출: 역할 회수 + 쇼룸 채널 삭제 (상품/티켓/후기/신고 기록은 DB에 그대로 남는다). */
export async function expelSeller(sellerId: string, adminId: string, guildId: string, note?: string) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw new SellerError("존재하지 않는 판매자입니다.");
  if (seller.status === SELLER_STATUS.WITHDRAWN) throw new SellerError("이미 퇴출된 판매자입니다.");

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (settings?.sellerRoleId) await removeGuildMemberRole(guildId, seller.discordUserId, settings.sellerRoleId);
  if (seller.channelId) {
    await prisma.stickyMessage.deleteMany({ where: { channelId: seller.channelId } });
    await deleteGuildChannel(seller.channelId);
  }
  if (seller.manageChannelId) {
    await prisma.stickyMessage.deleteMany({ where: { channelId: seller.manageChannelId } });
    await deleteGuildChannel(seller.manageChannelId);
  }

  await prisma.seller.update({
    where: { id: sellerId },
    data: {
      status: SELLER_STATUS.WITHDRAWN,
      channelId: null,
      manageChannelId: null,
      adminNote: note,
      processedByAdminId: adminId,
      processedAt: new Date(),
    },
  });

  sendDiscordDM(seller.discordUserId, {
    embeds: [
      {
        title: "❌ 판매자 퇴출",
        description: note ? `판매자 자격이 회수되었습니다: ${note}` : "판매자 자격이 회수되었습니다.",
        color: 0xef4444,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});
}

/**
 * 이용기간을 수동으로 연장한다 - 평소엔 이용료가 매달 포인트에서 자동 결제되지만
 * (src/bot/sellerBillingLoop.ts), 자동결제가 포인트 부족으로 실패해 정지된 뒤
 * 포인트를 충전했을 때 관리자가 즉시 복구해주거나, 프로모션 등으로 예외적으로
 * 기간을 더 줄 때 쓴다.
 */
export async function extendSeller(sellerId: string, adminId: string, guildId: string, days = 30) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw new SellerError("존재하지 않는 판매자입니다.");
  if (seller.status !== SELLER_STATUS.ACTIVE && seller.status !== SELLER_STATUS.EXPIRED) {
    throw new SellerError("활성 또는 만료 상태인 판매자만 연장할 수 있습니다.");
  }

  const wasExpired = seller.status === SELLER_STATUS.EXPIRED;
  const base = seller.nextBillingAt && seller.nextBillingAt > new Date() ? seller.nextBillingAt : new Date();
  const nextBillingAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  if (wasExpired) await unlockSellerChannel(seller);
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (wasExpired && settings?.sellerRoleId) await addGuildMemberRole(guildId, seller.discordUserId, settings.sellerRoleId);

  const updated = await prisma.seller.update({
    where: { id: sellerId },
    data: {
      status: SELLER_STATUS.ACTIVE,
      nextBillingAt,
      lastReminderDays: null,
      expiredAt: null,
      processedByAdminId: adminId,
      processedAt: new Date(),
    },
  });

  sendDiscordDM(seller.discordUserId, {
    embeds: [
      {
        title: "💳 판매자 이용기간 연장",
        description: `이용기간이 ${nextBillingAt.toLocaleDateString("ko-KR")}까지 연장되었습니다.`,
        color: 0x22c55e,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});

  return updated;
}

/** 이용기간 만료 처리 (billing 루프 전용) - 채널을 읽기전용으로 바꾸고 역할을 회수한다. */
export async function expireSeller(sellerId: string, guildId: string) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller || seller.status !== SELLER_STATUS.ACTIVE) return;

  await lockSellerChannel(seller);
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (settings?.sellerRoleId) await removeGuildMemberRole(guildId, seller.discordUserId, settings.sellerRoleId);

  await prisma.seller.update({
    where: { id: sellerId },
    data: { status: SELLER_STATUS.EXPIRED, expiredAt: new Date() },
  });

  sendDiscordDM(seller.discordUserId, {
    embeds: [
      {
        title: "❌ 판매자 이용기간 종료",
        description: "이용기간이 종료되어 판매 활동이 중단되었습니다. 입금 후 관리자에게 연장을 요청해주세요.",
        color: 0xef4444,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => {});
}

/** 구매 문의 티켓을 연다 - 구매자+판매자+(선택) 관리자만 볼 수 있는 비공개 채널. */
export async function openSellerTicket(params: {
  sellerId: string;
  productId?: string;
  buyerDiscordId: string;
  buyerTag: string;
  guildId: string;
  extraViewerDiscordIds?: string[];
}) {
  const { sellerId, productId, buyerDiscordId, buyerTag, guildId, extraViewerDiscordIds } = params;
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw new SellerError("존재하지 않는 판매자입니다.");
  if (seller.status !== SELLER_STATUS.ACTIVE) throw new SellerError("현재 활동 중인 판매자가 아닙니다.");
  if (seller.discordUserId === buyerDiscordId) throw new SellerError("본인 상품에는 구매 문의를 열 수 없습니다.");

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });

  const ticket = await prisma.sellerTicket.create({
    data: { sellerId, productId, buyerDiscordId, buyerTag },
  });

  const channelId = await createPrivateGuildChannel(
    guildId,
    `ticket-${ticket.id.slice(-6)}`,
    settings?.sellerTicketCategoryId ?? null,
    [seller.discordUserId, buyerDiscordId, ...(extraViewerDiscordIds ?? [])]
  );

  return prisma.sellerTicket.update({ where: { id: ticket.id }, data: { channelId } });
}

export async function setSellerTicketStatus(ticketId: string, status: string) {
  return prisma.sellerTicket.update({ where: { id: ticketId }, data: { status } });
}

/** 티켓을 닫는다 (거래완료로 끝났으면 판매자의 거래 횟수를 1 올린다). */
export async function closeSellerTicket(ticketId: string) {
  const ticket = await prisma.sellerTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new SellerError("존재하지 않는 티켓입니다.");

  if (ticket.status === SELLER_TICKET_STATUS.COMPLETED) {
    await prisma.seller.update({ where: { id: ticket.sellerId }, data: { dealCount: { increment: 1 } } });
  }
  const updated = await prisma.sellerTicket.update({
    where: { id: ticketId },
    data: { status: SELLER_TICKET_STATUS.CLOSED, closedAt: new Date() },
  });
  if (ticket.channelId) await deleteGuildChannel(ticket.channelId);
  return updated;
}

/** 거래완료 후 구매자가 남기는 후기 - 티켓당 1회만 가능. */
export async function createSellerReview(ticketId: string, buyerDiscordId: string, rating: number, content?: string) {
  if (rating < 1 || rating > 5) throw new SellerError("평점은 1~5 사이여야 합니다.");

  const ticket = await prisma.sellerTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new SellerError("존재하지 않는 티켓입니다.");
  if (ticket.buyerDiscordId !== buyerDiscordId) throw new SellerError("이 거래의 구매자만 후기를 남길 수 있습니다.");

  const existing = await prisma.sellerReview.findUnique({ where: { ticketId } });
  if (existing) throw new SellerError("이미 이 거래에 후기를 남겼습니다.");

  return prisma.$transaction(async (tx) => {
    const review = await tx.sellerReview.create({
      data: { sellerId: ticket.sellerId, ticketId, buyerDiscordId, rating, content },
    });
    await tx.seller.update({
      where: { id: ticket.sellerId },
      data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } },
    });
    return review;
  });
}

export async function fileSellerReport(params: {
  sellerId: string;
  reporterDiscordId: string;
  reason: string;
  detail?: string;
}) {
  const seller = await prisma.seller.findUnique({ where: { id: params.sellerId } });
  if (!seller) throw new SellerError("존재하지 않는 판매자입니다.");

  const report = await prisma.sellerReport.create({ data: params });

  notifyAdminsNewPendingItem(
    "판매자 신고",
    `**${seller.storeName}** 신고\n사유: ${params.reason}${params.detail ? `\n상세: ${params.detail}` : ""}\n\n처리: \`/판매자경고\`·\`/판매자정지\`·\`/판매자퇴출\`로 조치해주세요 (판매자: ${seller.storeName}).`
  ).catch(() => {});

  return report;
}
