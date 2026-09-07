import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type APIEmbedField,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { baseEmbed, won, pt } from "@/bot/format";
import { ARTWORK_STATUS, TIER_STATUS } from "@/lib/constants";
import type { User as ShopUser } from "@prisma/client";

// ── 메인(사용자) 패널 ────────────────────────────────────────

export function mainPanelEmbed() {
  return baseEmbed("🎨 자비샵").setDescription(
    "아래 버튼으로 상품 확인, 포인트 충전, 장바구니, 주문내역, 쿠폰함을 이용할 수 있습니다."
  );
}

export function mainPanelRows() {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("panel:products").setLabel("🛍️ 상품 보기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("panel:points").setLabel("💰 내 포인트").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("panel:cart").setLabel("🛒 장바구니").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("panel:orders").setLabel("📦 주문내역").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("panel:coupons").setLabel("🎟️ 쿠폰함").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("panel:inquiry").setLabel("💬 문의하기").setStyle(ButtonStyle.Secondary)
  );
  return [row1, row2];
}

// ── 상품 목록 / 상세 ─────────────────────────────────────────

export async function productSelectRow() {
  const tiers = await prisma.tier.findMany({
    where: { status: { not: TIER_STATUS.HIDDEN } },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { artworks: { where: { status: ARTWORK_STATUS.AVAILABLE } } } } },
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("select:tier")
    .setPlaceholder("구매할 등급을 선택하세요")
    .addOptions(
      tiers.slice(0, 25).map((t) => ({
        label: `${t.name} (${t.price.toLocaleString()}원)`,
        description: `재고 ${t._count.artworks}개 · 계정 ${t.minCount}~${t.maxCount}개 `,
        value: t.slug,
      }))
    );

  return { embed: baseEmbed("🛍️ 상품 목록").setDescription("아래 메뉴에서 등급을 선택하면 상세 정보를 볼 수 있습니다."), row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) };
}

export async function tierDetailPayload(slug: string) {
  const tier = await prisma.tier.findUnique({ where: { slug } });
  if (!tier) return null;

  const [stock, categories] = await Promise.all([
    prisma.artwork.count({ where: { tierId: tier.id, status: ARTWORK_STATUS.AVAILABLE } }),
    prisma.artwork.groupBy({ by: ["category"], where: { tierId: tier.id, status: ARTWORK_STATUS.AVAILABLE }, _count: true }),
  ]);

  const embed = baseEmbed(tier.name)
    .setDescription(tier.description || null)
    .addFields(
      { name: "가격", value: won(tier.price), inline: true },
      { name: "스킨 개수", value: `${tier.minCount}~${tier.maxCount}개 `, inline: true },
      { name: "재고", value: `${stock}개`, inline: true },
      { name: "포함 가능 카테고리", value: categories.length ? categories.map((c) => `${c.category}(${c._count})`).join(", ") : "-" }
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`buy:${slug}`).setLabel(`${won(tier.price)}로 구매`).setStyle(ButtonStyle.Success).setDisabled(stock === 0),
    new ButtonBuilder().setCustomId(`cartadd:${slug}`).setLabel("장바구니 담기").setStyle(ButtonStyle.Secondary).setDisabled(stock === 0)
  );

  return { embed, row, stock };
}

// ── 포인트 / 장바구니 / 주문 / 쿠폰 ──────────────────────────

export function pointsPayload(user: ShopUser, txs: { memo: string | null; type: string; amount: number }[]) {
  const embed = baseEmbed("💰 내 포인트").setDescription(`보유 포인트: **${pt(user.points)}**`);
  for (const t of txs.slice(0, 5)) {
    embed.addFields({ name: t.memo ?? t.type, value: `${t.amount >= 0 ? "+" : ""}${pt(t.amount)}` });
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("modal:topup").setLabel("계좌이체 충전 신청").setStyle(ButtonStyle.Primary)
  );
  return { embed, row };
}

export function cartPayload(
  items: { tier: { name: string; price: number }; quantity: number }[],
  hasItems: boolean
) {
  const embed = baseEmbed("🛒 내 장바구니");
  let total = 0;
  if (items.length === 0) embed.setDescription("장바구니가 비어 있습니다.");
  for (const item of items) {
    const subtotal = item.tier.price * item.quantity;
    total += subtotal;
    embed.addFields({ name: item.tier.name, value: `${item.quantity}개 × ${pt(item.tier.price)} = ${pt(subtotal)}` });
  }
  if (items.length > 0) embed.addFields({ name: "합계", value: pt(total) });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("cart:checkout").setLabel("포인트로 결제").setStyle(ButtonStyle.Success).setDisabled(!hasItems)
  );
  return { embed, row };
}

export function ordersPayload(
  orders: { orderNo: string; tier: { name: string }; finalAmount: number; status: string; artwork: { title: string } | null }[]
) {
  const embed = baseEmbed("📦 내 주문 내역");
  if (orders.length === 0) embed.setDescription("주문 내역이 없습니다.");
  for (const o of orders) {
    embed.addFields({
      name: `#${o.orderNo} · ${o.tier.name}`,
      value: `${pt(o.finalAmount)} · ${o.status}${o.artwork ? ` · ${o.artwork.title}` : ""}`,
    });
  }
  return { embed };
}

export function couponsPayload(userCoupons: { coupon: { name: string; code: string; validTo: Date }; usedAt: Date | null }[]) {
  const embed = baseEmbed("🎟️ 내 쿠폰함");
  if (userCoupons.length === 0) embed.setDescription("보유한 쿠폰이 없습니다.");
  for (const uc of userCoupons) {
    embed.addFields({
      name: `${uc.coupon.name} (${uc.coupon.code})`,
      value: `${uc.usedAt ? "사용완료" : "사용가능"} · ~${uc.coupon.validTo.toLocaleDateString("ko-KR")}`,
    });
  }
  return { embed };
}

// ── 관리자 패널 ──────────────────────────────────────────────

export function adminPanelEmbed() {
  return baseEmbed("🛠️ 자비샵 관리자 패널").setDescription("아래 버튼으로 승인 대기 항목과 통계를 바로 확인/처리할 수 있습니다.");
}

export function adminPanelRows() {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:topups").setLabel("💳 충전 대기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("admin:refunds").setLabel("💰 환불 대기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("admin:inquiries").setLabel("💬 문의 대기").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:stats").setLabel("📊 통계").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("admin:tiers").setLabel("📋 등급 목록").setStyle(ButtonStyle.Secondary)
  );
  return [row1, row2];
}

const MAX_ACTIONABLE_ITEMS = 5;

export async function pendingTopUpsPayload() {
  const requests = await prisma.pointTopUpRequest.findMany({
    where: { status: "PENDING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
    take: MAX_ACTIONABLE_ITEMS,
  });
  const totalPending = await prisma.pointTopUpRequest.count({ where: { status: "PENDING" } });

  const embed = baseEmbed("💳 대기 중인 충전 신청").setDescription(
    totalPending === 0
      ? "대기 중인 신청이 없습니다."
      : `총 ${totalPending}건 중 ${requests.length}건 표시 (버튼으로 바로 승인/거절)`
  );
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const r of requests) {
    embed.addFields({
      name: `${r.amount.toLocaleString()}원 · 입금자: ${r.depositorName}`,
      value: `회원: ${r.user.name}`,
    });
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`topup:approve:${r.id}`).setLabel(`승인 (${r.depositorName})`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`topup:reject:${r.id}`).setLabel("거절").setStyle(ButtonStyle.Danger)
      )
    );
  }
  return { embed, rows };
}

export async function pendingRefundsPayload() {
  const refunds = await prisma.refundRequest.findMany({
    where: { status: "PENDING" },
    include: { user: true, order: { include: { tier: true } } },
    orderBy: { createdAt: "asc" },
    take: MAX_ACTIONABLE_ITEMS,
  });
  const totalPending = await prisma.refundRequest.count({ where: { status: "PENDING" } });

  const embed = baseEmbed("💰 대기 중인 환불 요청").setDescription(
    totalPending === 0 ? "대기 중인 요청이 없습니다." : `총 ${totalPending}건 중 ${refunds.length}건 표시`
  );
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const r of refunds) {
    embed.addFields({
      name: `#${r.order.orderNo} · ${r.order.tier.name} · ${pt(r.order.finalAmount)}`,
      value: `회원: ${r.user.name} · 사유: ${r.reason}`,
    });
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`refund:approve:${r.id}`).setLabel("승인").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`refund:reject:${r.id}`).setLabel("거절").setStyle(ButtonStyle.Danger)
      )
    );
  }
  return { embed, rows };
}

export async function pendingInquiriesPayload() {
  const inquiries = await prisma.inquiry.findMany({
    where: { status: "WAITING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
    take: MAX_ACTIONABLE_ITEMS,
  });
  const totalPending = await prisma.inquiry.count({ where: { status: "WAITING" } });

  const embed = baseEmbed("💬 답변 대기 문의").setDescription(
    totalPending === 0 ? "대기 중인 문의가 없습니다." : `총 ${totalPending}건 중 ${inquiries.length}건 표시`
  );
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const i of inquiries) {
    const field: APIEmbedField = { name: `${i.title} (${i.user.name})`, value: i.content.slice(0, 200) };
    embed.addFields(field);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`inquiry:answer:${i.id}`).setLabel("답변하기").setStyle(ButtonStyle.Primary)
      )
    );
  }
  return { embed, rows };
}

export async function tierListPayload() {
  const tiers = await prisma.tier.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { artworks: true } } },
  });
  const embed = baseEmbed("📋 등급 목록");
  for (const t of tiers) {
    embed.addFields({
      name: `${t.name} (${t.slug})`,
      value: `${won(t.price)} · ${t.minCount}~${t.maxCount}개 · 재고 ${t._count.artworks}개 · ${t.status}`,
    });
  }
  return { embed };
}
