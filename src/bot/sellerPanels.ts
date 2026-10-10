import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { won } from "@/bot/format";
import { buildPanel } from "@/bot/ui";
import { SELLER_STATUS } from "@/lib/constants";
import type { Seller, SellerProduct, SellerTicket } from "@prisma/client";

export const SELLER_APPLY_BUTTON_ID = "seller:apply";

function sellerApplyRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SELLER_APPLY_BUTTON_ID).setLabel("📝 판매자 신청").setStyle(ButtonStyle.Primary)
  );
}

export function sellerGuidePayload(monthlyPrice: number, freeTrialDays: number) {
  return buildPanel({
    title: "🏪 판매자 시스템",
    description: "서버 안에서 직접 상품을 판매할 수 있는 입점 시스템입니다. 아래 버튼으로 신청해주세요.",
    banner: true,
    fields: [
      { name: "💰 이용료", value: `월 ${won(monthlyPrice)} (포인트에서 자동 결제)\n첫 ${freeTrialDays}일 무료` },
      {
        name: "⚠️ 결제 안내",
        value: "결제일 7/3/1일 전에 DM으로 미리 알려드립니다. 결제일에 포인트가 부족하면 자동으로 활동이 정지되니 미리 충전해주세요.",
      },
      {
        name: "✅ 제공 혜택",
        value: [
          "판매자 전용 쇼룸 채널 1개",
          "판매자 역할 지급",
          "상품 등록 (`/상품등록`)",
          "구매 문의 티켓 시스템",
          "후기/평점 시스템",
          "판매자 통계 (`/판매자통계`)",
        ].join("\n"),
      },
      {
        name: "📋 신청 방법",
        value: "이 메시지의 **📝 판매자 신청** 버튼을 누르거나 `/판매자신청` 명령어를 사용하세요. 관리자 승인 후 바로 쇼룸 채널이 생성됩니다.",
      },
      {
        name: "🚫 판매 금지 품목",
        value: "사기/피싱, 개인정보, 해킹/악성코드, 불법 프로그램, 계정 탈취, 도난/위조 상품, 불법 도박/약물/무기, 저작권 침해, 허위·기만 상품, 그 외 서버 규칙 위반 상품은 판매할 수 없습니다. 위반 시 즉시 퇴출됩니다.",
      },
      {
        name: "🧾 유의사항",
        value: "판매자는 본인이 판매하는 상품/서비스에 대한 책임을 직접 부담합니다. 거래 분쟁은 운영진이 중재하지만, 실제 거래 책임은 판매자 본인에게 있습니다.",
      },
    ],
    rows: [sellerApplyRow()],
  });
}

function sellerRatingLine(seller: { ratingCount: number; ratingSum: number }) {
  if (seller.ratingCount === 0) return "후기 없음";
  const avg = (seller.ratingSum / seller.ratingCount).toFixed(1);
  return `⭐ ${avg} (${seller.ratingCount}개 후기)`;
}

export function sellerProductPayload(seller: Seller, product: SellerProduct, disabled: boolean) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`seller:buy:${product.id}`).setLabel("🛒 구매 문의").setStyle(ButtonStyle.Success).setDisabled(disabled)
  );
  return buildPanel({
    title: `🛒 ${product.name}`,
    description: product.description || undefined,
    footer: `판매자: ${seller.storeName}`,
    fields: [
      { name: "💰 가격", value: won(product.price) },
      { name: "📦 재고", value: product.stock != null ? `${product.stock}개` : "문의" },
      { name: "⭐ 판매자 평점", value: sellerRatingLine(seller) },
      ...(product.purchaseMethod ? [{ name: "💳 구매 방법 / 환불 안내", value: product.purchaseMethod }] : []),
    ],
    rows: [row],
  });
}

export function sellerTicketOpenPayload(seller: Seller, product: SellerProduct | null, buyerTag: string, ticketId: string) {
  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`sellerticket:paid:${ticketId}`).setLabel("💰 결제 완료").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`sellerticket:delivered:${ticketId}`).setLabel("📦 상품 전달").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`sellerticket:complete:${ticketId}`).setLabel("✅ 거래 완료").setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`sellerticket:report:${ticketId}`).setLabel("🚨 신고").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`sellerticket:cancel:${ticketId}`).setLabel("❌ 거래 취소").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sellerticket:close:${ticketId}`).setLabel("🔒 티켓 닫기").setStyle(ButtonStyle.Secondary)
    ),
  ];
  return buildPanel({
    title: "📦 구매 문의",
    description: [
      `상품: ${product?.name ?? "일반 문의"}`,
      product ? `가격: ${won(product.price)}` : null,
      `구매자: ${buyerTag}`,
      `판매자: ${seller.storeName}`,
      "",
      "이 채널에서 판매자와 직접 거래 내용을 상담해주세요. 거래가 끝나면 아래 버튼으로 상태를 갱신해주세요.",
    ]
      .filter(Boolean)
      .join("\n"),
    rows,
  });
}

export function sellerReviewPromptPayload(ticketId: string) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder().setCustomId(`sellerreview:${n}:${ticketId}`).setLabel("⭐".repeat(n)).setStyle(ButtonStyle.Secondary)
    )
  );
  return buildPanel({
    title: "🎉 거래가 완료되었습니다",
    description: "구매자님, 판매자 후기를 남겨주세요!",
    rows: [row],
  });
}

const STATUS_LABEL: Record<string, string> = {
  [SELLER_STATUS.PENDING]: "⏳ 승인 대기",
  [SELLER_STATUS.ACTIVE]: "🟢 활동 중",
  [SELLER_STATUS.SUSPENDED]: "🚨 정지",
  [SELLER_STATUS.EXPIRED]: "❌ 만료",
  [SELLER_STATUS.REJECTED]: "거절됨",
  [SELLER_STATUS.WITHDRAWN]: "퇴출됨",
};

export function sellerStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function sellerInfoPayload(seller: Seller) {
  return buildPanel({
    title: `🏪 ${seller.storeName}`,
    fields: [
      { name: "상태", value: sellerStatusLabel(seller.status) },
      { name: "평점", value: sellerRatingLine(seller) },
      { name: "거래완료", value: `${seller.dealCount}건` },
      { name: "판매자", value: seller.discordTag },
      { name: "채널", value: seller.channelId ? `<#${seller.channelId}>` : "-" },
      { name: "다음 결제일", value: seller.nextBillingAt ? seller.nextBillingAt.toLocaleDateString("ko-KR") : "-" },
      ...(seller.category ? [{ name: "카테고리", value: seller.category }] : []),
      ...(seller.adminNote ? [{ name: "관리자 메모", value: seller.adminNote }] : []),
    ],
  });
}

// ── 판매자 자기관리 패널 ("/판매자패널") ──────────────────────────────

async function sellerStatsFields(seller: Seller) {
  const [productCount, openTickets, pendingReports] = await Promise.all([
    prisma.sellerProduct.count({ where: { sellerId: seller.id, active: true } }),
    prisma.sellerTicket.count({ where: { sellerId: seller.id, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
    prisma.sellerReport.count({ where: { sellerId: seller.id, status: "PENDING" } }),
  ]);
  const avg = seller.ratingCount > 0 ? (seller.ratingSum / seller.ratingCount).toFixed(1) : "-";
  return [
    { name: "상태", value: sellerStatusLabel(seller.status) },
    { name: "평점", value: `⭐ ${avg} (${seller.ratingCount}개)` },
    { name: "거래완료", value: `${seller.dealCount}건` },
    { name: "등록 상품", value: `${productCount}개` },
    { name: "진행 중 문의", value: `${openTickets}건` },
    { name: "미처리 신고", value: `${pendingReports}건` },
    { name: "다음 결제일", value: seller.nextBillingAt ? seller.nextBillingAt.toLocaleDateString("ko-KR") : "-" },
  ];
}

export async function sellerStatsPayload(seller: Seller) {
  return buildPanel({ title: `📊 ${seller.storeName}`, fields: await sellerStatsFields(seller) });
}

function sellerManagePanelRows() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("sellerpanel:newproduct").setLabel("🛒 상품 등록").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("sellerpanel:products").setLabel("📦 내 상품 관리").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sellerpanel:tickets").setLabel("🎫 진행 중인 문의").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("sellerpanel:stats").setLabel("📊 통계 보기").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sellerpanel:editinfo").setLabel("⚙️ 상점 정보 수정").setStyle(ButtonStyle.Secondary)
    ),
  ];
}

export function sellerManagePanelPayload(seller: Seller) {
  const avg = seller.ratingCount > 0 ? (seller.ratingSum / seller.ratingCount).toFixed(1) : "-";
  return buildPanel({
    title: `🏪 ${seller.storeName} 관리 패널`,
    fields: [
      { name: "상태", value: sellerStatusLabel(seller.status) },
      { name: "평점", value: `⭐ ${avg} (${seller.ratingCount}개)` },
      { name: "거래완료", value: `${seller.dealCount}건` },
      { name: "다음 결제일", value: seller.nextBillingAt ? seller.nextBillingAt.toLocaleDateString("ko-KR") : "-" },
      { name: "쇼룸 채널", value: seller.channelId ? `<#${seller.channelId}>` : "-" },
    ],
    rows: sellerManagePanelRows(),
  });
}

/** /판매자통계 - 관리 패널 버튼까지 같이 붙여서 보여준다. */
export async function sellerStatsWithManagePayload(seller: Seller) {
  return buildPanel({ title: `📊 ${seller.storeName}`, fields: await sellerStatsFields(seller), rows: sellerManagePanelRows() });
}

export function sellerProductListPayload(products: SellerProduct[]) {
  if (products.length === 0) {
    return buildPanel({ title: "📦 내 상품 목록", description: "등록된 상품이 없습니다. [🛒 상품 등록] 버튼으로 추가해주세요." });
  }
  const fields = products.map((p) => ({
    name: `${p.active ? "🟢" : "⚪"} ${p.name} - ${won(p.price)}`,
    value: `재고: ${p.stock != null ? `${p.stock}개` : "문의"} · 상태: ${p.active ? "판매중" : "비활성"}`,
  }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sellerpanel:toggleproduct")
    .setPlaceholder("판매중/비활성 전환할 상품을 선택하세요")
    .addOptions(
      products.slice(0, 25).map((p) => ({
        label: `${p.name} (${p.active ? "판매중 → 비활성으로" : "비활성 → 판매중으로"})`.slice(0, 100),
        value: p.id,
      }))
    );
  return buildPanel({
    title: "📦 내 상품 목록",
    fields,
    rows: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });
}

export function sellerTicketListPayload(tickets: (SellerTicket & { product: SellerProduct | null })[]) {
  if (tickets.length === 0) {
    return buildPanel({ title: "🎫 진행 중인 구매 문의", description: "진행 중인 문의가 없습니다." });
  }
  return buildPanel({
    title: "🎫 진행 중인 구매 문의",
    fields: tickets.map((t) => ({
      name: `${t.product?.name ?? "일반 문의"} · ${t.buyerTag}`,
      value: `상태: ${t.status}${t.channelId ? ` · <#${t.channelId}>` : ""}`,
    })),
  });
}

export function sellerListPayload(sellers: Seller[]) {
  if (sellers.length === 0) {
    return buildPanel({ title: "🏪 입점 판매자 목록", description: "현재 활동 중인 판매자가 없습니다." });
  }
  return buildPanel({
    title: "🏪 입점 판매자 목록",
    fields: sellers.map((s) => {
      const avg = s.ratingCount > 0 ? (s.ratingSum / s.ratingCount).toFixed(1) : "-";
      return {
        name: `🏪 ${s.storeName}${s.category ? ` · ${s.category}` : ""}`,
        value: `⭐ ${avg} (${s.ratingCount}개) · 거래 ${s.dealCount}건${s.channelId ? ` · <#${s.channelId}>` : ""}`,
      };
    }),
  });
}
