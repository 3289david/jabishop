import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type APIEmbedField,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { baseEmbed, won, pt } from "@/bot/format";
import { ARTWORK_STATUS, TIER_STATUS, SHOP_SUBSCRIPTION_TIER_SLUG } from "@/lib/constants";
import { getShopName } from "@/lib/shop";
import { getAppOrigin } from "@/lib/appUrl";
import type { User as ShopUser } from "@prisma/client";

// ── 메인(사용자) 패널 ────────────────────────────────────────

export async function mainPanelEmbed() {
  const shopName = await getShopName();
  return baseEmbed(`🎨 ${shopName}`).setDescription(
    "아래 버튼으로 상품 확인, 포인트 충전, 장바구니, 주문내역, 쿠폰함을 이용할 수 있습니다."
  );
}

export function mainPanelRows() {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("panel:products").setLabel("🛍️ 구매하기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("panel:points").setLabel("💰 포인트 관리").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("panel:cart").setLabel("🛒 장바구니").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("panel:orders").setLabel("📦 주문내역").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("panel:coupons").setLabel("🎟️ 쿠폰함").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("panel:inquiry").setLabel("💬 문의하기").setStyle(ButtonStyle.Secondary)
  );
  return [row1, row2];
}

// ── 파트너 안내 패널 ─────────────────────────────────────────

export function partnerPanelEmbed() {
  return baseEmbed("🤝 파트너 프로그램").setDescription(
    "서버/채널 상호 홍보 파트너를 모집합니다. 아래 버튼으로 신청하고, 승인된 뒤에는 같은 곳에서 웹훅 등록 등\n" +
      "내 파트너 정보를 직접 관리할 수 있습니다."
  );
}

export function partnerPanelRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("partner:apply").setLabel("🤝 파트너 신청하기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("partner:manage").setLabel("⚙️ 내 파트너 정보 관리").setStyle(ButtonStyle.Secondary)
  );
}

// ── 이벤트 패널 ──────────────────────────────────────────────

export async function eventPanelEmbed() {
  const s = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const status = (on: boolean | undefined) => (on ? "🟢 진행 중" : "⚪ 진행 안 함");

  return baseEmbed("🎉 이벤트")
    .setDescription("아래 버튼으로 진행 중인 이벤트에 바로 참여할 수 있어요.")
    .addFields(
      { name: "🗓️ 출석체크", value: status(s?.checkInEventEnabled), inline: true },
      { name: "🎁 친구 초대", value: status(s?.referralEventEnabled), inline: true },
      { name: "🎰 룰렛/뽑기", value: `${status(s?.gachaEventEnabled)} (1회 ${s?.gachaCostPoints ?? 100}P)`, inline: true }
    );
}

export async function eventPanelRows() {
  const s = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("event:checkin")
      .setLabel("🗓️ 출석체크")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!s?.checkInEventEnabled),
    new ButtonBuilder()
      .setCustomId("event:gacha")
      .setLabel("🎰 룰렛 돌리기")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!s?.gachaEventEnabled)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("event:referral:code")
      .setLabel("🎁 내 초대코드")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!s?.referralEventEnabled),
    new ButtonBuilder()
      .setCustomId("event:referral:register")
      .setLabel("✏️ 친구 초대코드 등록")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!s?.referralEventEnabled)
  );
  return [row1, row2];
}

/** 이벤트 패널과는 별개로, 채널에 게시하는 화려한 홍보용 공지 임베드 (버튼 없음). */
export function eventPromoEmbed() {
  return baseEmbed("🎉🎊 자비샵 신규 이벤트 4종 오픈! 🎊🎉")
    .setColor(0xfbbf24)
    .setDescription(
      "가만히 있어도, 친구를 데려와도, 운이 좋으면 대박까지! 지금 바로 참여해보세요 ✨\n" +
        "(각 이벤트 진행 여부는 아래 패널에서 실시간으로 확인할 수 있어요)"
    )
    .addFields(
      {
        name: "🗓️ 매일 출석체크",
        value: "하루 한 번, `/출석체크`(또는 패널 버튼)만 눌러도 포인트 지급!\n연속 출석할수록 보너스가 쌓여 **최대 50P**까지 받을 수 있어요.",
      },
      {
        name: "🎁 친구 초대 이벤트",
        value:
          "내 초대코드를 친구가 등록하면 **바로 200P**! 그 친구가 첫 구매까지 완료하면\n**나는 800P 추가**(총 1,000P), **친구는 500P**까지 받아요!",
      },
      {
        name: "🎰 룰렛 뽑기",
        value: "포인트를 걸고 룰렛 한 방! 최대 **300P**부터 **10% 할인쿠폰**까지\n다양한 보상이 기다리고 있어요.",
      },
      {
        name: "💳 구매 축하 쿠폰",
        value: "100원 이상 상품 구매할 때마다 **5% 확률**로 **5% 할인쿠폰**이 자동 지급돼요. 잊지 말고 구매하기 버튼을 눌러보세요!",
      }
    )
    .setFooter({ text: "이벤트 패널에서 바로 참여할 수 있어요" })
    .setTimestamp();
}

// ── 인증 패널 ────────────────────────────────────────────────
// "인증하기"를 누르면 자체 호스팅한 /auth 페이지로 이동해 디스코드 OAuth 연결 +
// ALTCHA(자체 호스팅 캡챠)를 통과해야 역할이 지급된다 (예전엔 외부 서비스
// restore.salv.me로 보내거나, 테넌트는 클릭 즉시 아무 확인 없이 역할만 줬음).

export async function verifyPanelEmbed() {
  const embed = baseEmbed("💕 인증 채널 💕").setColor(0xff6fa5).setDescription("인증을 하시려면 아래 버튼을 클릭해 주세요");
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (settings?.verifyRoleId) {
    embed.addFields({ name: "역할", value: `인증을 하시면 <@&${settings.verifyRoleId}> 역할이 부여돼요` });
  }
  return embed;
}

export function verifyPanelRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("인증하기").setStyle(ButtonStyle.Link).setURL(`${getAppOrigin()}/api/auth/discord/verify-start`)
  );
}

// ── 상품 목록 / 상세 ─────────────────────────────────────────

const UNCATEGORIZED_LABEL = "기타";

/** 카테고리 선택 단계가 필요한지 판단하기 위해, 판매 중인 등급들의 고유 카테고리 목록을 반환한다. */
export async function listProductCategories(): Promise<string[]> {
  const tiers = await prisma.tier.findMany({
    where: { status: { not: TIER_STATUS.HIDDEN } },
    select: { category: true },
  });
  return Array.from(new Set(tiers.map((t) => t.category || UNCATEGORIZED_LABEL))).sort();
}

export async function categorySelectRow() {
  const categories = await listProductCategories();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("select:category")
    .setPlaceholder("카테고리를 선택하세요")
    .addOptions(categories.slice(0, 25).map((c) => ({ label: c, value: c })));

  return {
    embed: baseEmbed("🛍️ 구매하기").setDescription("카테고리를 선택하면 해당 카테고리의 상품 목록을 볼 수 있습니다."),
    row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
  };
}

export async function productSelectRow(category?: string) {
  const tiers = await prisma.tier.findMany({
    where: {
      status: { not: TIER_STATUS.HIDDEN },
      ...(category != null ? { category: category === UNCATEGORIZED_LABEL ? null : category } : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { artworks: { where: { status: ARTWORK_STATUS.AVAILABLE } } } } },
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("select:tier")
    .setPlaceholder("구매할 등급을 선택하세요")
    .addOptions(
      tiers.slice(0, 25).map((t) => ({
        label: `${t.name} (${t.price.toLocaleString()}원)`,
        description: t.slug === SHOP_SUBSCRIPTION_TIER_SLUG ? "무제한" : `재고 ${t._count.artworks}개`,
        value: t.slug,
      }))
    );

  return {
    embed: baseEmbed(category ? `🛍️ ${category} 상품 목록` : "🛍️ 상품 목록").setDescription(
      "아래 메뉴에서 등급을 선택하면 상세 정보를 볼 수 있습니다."
    ),
    row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
  };
}

export async function tierDetailPayload(slug: string) {
  const tier = await prisma.tier.findUnique({ where: { slug } });
  if (!tier) return null;

  // "자판기 통째로 구매"는 미리 채워둔 재고 개념이 없다 - 구매하는 순간 바로 만들어서
  // 지급하므로 항상 구매 가능하다.
  const isUnlimited = tier.slug === SHOP_SUBSCRIPTION_TIER_SLUG;
  const stock = isUnlimited ? 1 : await prisma.artwork.count({ where: { tierId: tier.id, status: ARTWORK_STATUS.AVAILABLE } });

  const embed = baseEmbed(tier.name)
    .setDescription(tier.description || null)
    .addFields(
      { name: "가격", value: won(tier.price), inline: true },
      { name: "재고", value: isUnlimited ? "무제한" : `${stock}개`, inline: true }
    );

  // "자판기 통째로 구매"는 수량/장바구니/재입고 개념이 없다 - 구매 버튼 하나만 두고,
  // 누르면(handleBuy) 원하는 샵 주소/이름을 입력받는 모달이 먼저 뜬다.
  const row = isUnlimited
    ? new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`buy:${slug}`).setLabel(`${won(tier.price)}로 구매`).setStyle(ButtonStyle.Success)
      )
    : new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`buy:${slug}`).setLabel(`${won(tier.price)}로 구매`).setStyle(ButtonStyle.Success).setDisabled(stock === 0),
        new ButtonBuilder().setCustomId(`qtybuy:${slug}`).setLabel("🔢 수량 지정 구매").setStyle(ButtonStyle.Success).setDisabled(stock === 0),
        new ButtonBuilder().setCustomId(`cartadd:${slug}`).setLabel("장바구니 담기").setStyle(ButtonStyle.Secondary).setDisabled(stock === 0),
        new ButtonBuilder()
          .setCustomId(`restock:${slug}`)
          .setLabel("🔔 재입고 알림받기")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(stock > 0)
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

export async function adminPanelEmbed() {
  const shopName = await getShopName();
  return baseEmbed(`🛠️ ${shopName} 관리자 패널`).setDescription("아래 버튼으로 승인 대기 항목과 통계를 바로 확인/처리할 수 있습니다.");
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
  // 디스코드 임베드는 필드를 25개까지만 허용한다 - 그 이상이면 addFields가 에러를 던져
  // 목록이 아예 안 보이는 상태가 되므로, 여기서 미리 잘라서 방지한다.
  const MAX_EMBED_FIELDS = 25;
  for (const t of tiers.slice(0, MAX_EMBED_FIELDS)) {
    embed.addFields({
      name: `${t.name} (${t.slug})`,
      value: `${won(t.price)} · 재고 ${t._count.artworks}개 · ${t.status}${t.category ? ` · ${t.category}` : ""}`,
    });
  }
  if (tiers.length > MAX_EMBED_FIELDS) {
    embed.setDescription(`전체 ${tiers.length}개 중 ${MAX_EMBED_FIELDS}개만 표시됩니다.`);
  }
  return { embed };
}
