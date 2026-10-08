import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { baseEmbed, won } from "@/bot/format";
import { SELLER_STATUS } from "@/lib/constants";
import type { Seller, SellerProduct, SellerTicket } from "@prisma/client";

export const SELLER_APPLY_BUTTON_ID = "seller:apply";

export function sellerGuideEmbed(monthlyPrice: number, freeTrialDays: number) {
  return baseEmbed("🏪 판매자 시스템")
    .setDescription("서버 안에서 직접 상품을 판매할 수 있는 입점 시스템입니다. 아래 버튼으로 신청해주세요.")
    .addFields(
      { name: "💰 이용료", value: `월 ${won(monthlyPrice)}\n첫 ${freeTrialDays}일 무료`, inline: true },
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
      }
    );
}

export function sellerApplyRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SELLER_APPLY_BUTTON_ID).setLabel("📝 판매자 신청").setStyle(ButtonStyle.Primary)
  );
}

function sellerRatingLine(seller: { ratingCount: number; ratingSum: number }) {
  if (seller.ratingCount === 0) return "후기 없음";
  const avg = (seller.ratingSum / seller.ratingCount).toFixed(1);
  return `⭐ ${avg} (${seller.ratingCount}개 후기)`;
}

export function sellerProductEmbed(seller: Seller, product: SellerProduct) {
  return baseEmbed(`🛒 ${product.name}`)
    .setDescription(product.description || null)
    .addFields(
      { name: "💰 가격", value: won(product.price), inline: true },
      { name: "📦 재고", value: product.stock != null ? `${product.stock}개` : "문의", inline: true },
      { name: "⭐ 판매자 평점", value: sellerRatingLine(seller), inline: true },
      ...(product.purchaseMethod ? [{ name: "💳 구매 방법 / 환불 안내", value: product.purchaseMethod }] : [])
    )
    .setFooter({ text: `판매자: ${seller.storeName}` });
}

export function sellerProductRow(productId: string, disabled: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`seller:buy:${productId}`)
      .setLabel("🛒 구매 문의")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

export function sellerTicketOpenEmbed(seller: Seller, product: SellerProduct | null, buyerTag: string) {
  return baseEmbed("📦 구매 문의")
    .setDescription(
      [
        `상품: ${product?.name ?? "일반 문의"}`,
        product ? `가격: ${won(product.price)}` : null,
        `구매자: ${buyerTag}`,
        `판매자: ${seller.storeName}`,
        "",
        "이 채널에서 판매자와 직접 거래 내용을 상담해주세요. 거래가 끝나면 아래 버튼으로 상태를 갱신해주세요.",
      ]
        .filter(Boolean)
        .join("\n")
    );
}

export function sellerTicketControlRow(ticketId: string) {
  return [
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
}

export function sellerReviewPromptRow(ticketId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder().setCustomId(`sellerreview:${n}:${ticketId}`).setLabel("⭐".repeat(n)).setStyle(ButtonStyle.Secondary)
    )
  );
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

export function sellerInfoEmbed(seller: Seller) {
  return baseEmbed(`🏪 ${seller.storeName}`).addFields(
    { name: "상태", value: sellerStatusLabel(seller.status), inline: true },
    { name: "평점", value: sellerRatingLine(seller), inline: true },
    { name: "거래완료", value: `${seller.dealCount}건`, inline: true },
    { name: "판매자", value: seller.discordTag, inline: true },
    { name: "채널", value: seller.channelId ? `<#${seller.channelId}>` : "-", inline: true },
    {
      name: "다음 결제일",
      value: seller.nextBillingAt ? seller.nextBillingAt.toLocaleDateString("ko-KR") : "-",
      inline: true,
    },
    ...(seller.category ? [{ name: "카테고리", value: seller.category, inline: true }] : []),
    ...(seller.adminNote ? [{ name: "관리자 메모", value: seller.adminNote }] : [])
  );
}

// ── 판매자 자기관리 패널 ("/판매자패널") ──────────────────────────────

export function sellerManagePanelEmbed(seller: Seller) {
  const avg = seller.ratingCount > 0 ? (seller.ratingSum / seller.ratingCount).toFixed(1) : "-";
  return baseEmbed(`🏪 ${seller.storeName} 관리 패널`).addFields(
    { name: "상태", value: sellerStatusLabel(seller.status), inline: true },
    { name: "평점", value: `⭐ ${avg} (${seller.ratingCount}개)`, inline: true },
    { name: "거래완료", value: `${seller.dealCount}건`, inline: true },
    {
      name: "다음 결제일",
      value: seller.nextBillingAt ? seller.nextBillingAt.toLocaleDateString("ko-KR") : "-",
      inline: true,
    },
    { name: "쇼룸 채널", value: seller.channelId ? `<#${seller.channelId}>` : "-", inline: true }
  );
}

export function sellerManagePanelRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sellerpanel:newproduct").setLabel("🛒 상품 등록").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sellerpanel:products").setLabel("📦 내 상품 관리").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sellerpanel:tickets").setLabel("🎫 진행 중인 문의").setStyle(ButtonStyle.Secondary)
  );
}

export function sellerProductListEmbed(products: SellerProduct[]) {
  const embed = baseEmbed("📦 내 상품 목록");
  if (products.length === 0) {
    embed.setDescription("등록된 상품이 없습니다. [🛒 상품 등록] 버튼으로 추가해주세요.");
    return embed;
  }
  for (const p of products) {
    embed.addFields({
      name: `${p.active ? "🟢" : "⚪"} ${p.name} - ${won(p.price)}`,
      value: `재고: ${p.stock != null ? `${p.stock}개` : "문의"} · 상태: ${p.active ? "판매중" : "비활성"}`,
    });
  }
  return embed;
}

export function sellerProductToggleSelectRow(products: SellerProduct[]) {
  if (products.length === 0) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sellerpanel:toggleproduct")
    .setPlaceholder("판매중/비활성 전환할 상품을 선택하세요")
    .addOptions(
      products.slice(0, 25).map((p) => ({
        label: `${p.name} (${p.active ? "판매중 → 비활성으로" : "비활성 → 판매중으로"})`.slice(0, 100),
        value: p.id,
      }))
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function sellerTicketListEmbed(tickets: (SellerTicket & { product: SellerProduct | null })[]) {
  const embed = baseEmbed("🎫 진행 중인 구매 문의");
  if (tickets.length === 0) {
    embed.setDescription("진행 중인 문의가 없습니다.");
    return embed;
  }
  for (const t of tickets) {
    embed.addFields({
      name: `${t.product?.name ?? "일반 문의"} · ${t.buyerTag}`,
      value: `상태: ${t.status}${t.channelId ? ` · <#${t.channelId}>` : ""}`,
    });
  }
  return embed;
}

export function sellerListEmbed(sellers: Seller[]) {
  const embed = baseEmbed("🏪 입점 판매자 목록");
  if (sellers.length === 0) {
    embed.setDescription("현재 활동 중인 판매자가 없습니다.");
    return embed;
  }
  for (const s of sellers) {
    const avg = s.ratingCount > 0 ? (s.ratingSum / s.ratingCount).toFixed(1) : "-";
    embed.addFields({
      name: `🏪 ${s.storeName}${s.category ? ` · ${s.category}` : ""}`,
      value: `⭐ ${avg} (${s.ratingCount}개) · 거래 ${s.dealCount}건${s.channelId ? ` · <#${s.channelId}>` : ""}`,
    });
  }
  return embed;
}
