import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type APIEmbedField,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { won, pt } from "@/bot/format";
import { ARTWORK_STATUS, TIER_STATUS, SHOP_SUBSCRIPTION_TIER_SLUG } from "@/lib/constants";
import { getShopName } from "@/lib/shop";
import { getAppOrigin } from "@/lib/appUrl";
import {
  buildPanel,
  startListContainer,
  addListItem,
  finishContainer,
  ACCENT_COLOR,
} from "@/bot/ui";
import type { User as ShopUser } from "@prisma/client";

// ── 메인(사용자) 패널 ────────────────────────────────────────

export async function mainPanelPayload() {
  const shopName = await getShopName();
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
  return buildPanel({
    title: `🎨 ${shopName}`,
    description: "아래 버튼으로 상품 확인, 포인트 충전, 장바구니, 주문내역, 쿠폰함을 이용할 수 있습니다.",
    banner: true,
    rows: [row1, row2],
  });
}

// ── 파트너 안내 패널 ─────────────────────────────────────────

export function partnerPanelPayload() {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("partner:apply").setLabel("🤝 파트너 신청하기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("partner:manage").setLabel("⚙️ 내 파트너 정보 관리").setStyle(ButtonStyle.Secondary)
  );
  return buildPanel({
    title: "🤝 파트너 프로그램",
    description:
      "서버/채널 상호 홍보 파트너를 모집합니다. 아래 버튼으로 신청하고, 승인된 뒤에는 같은 곳에서 웹훅 등록 등\n내 파트너 정보를 직접 관리할 수 있습니다.",
    rows: [row],
  });
}

// ── 이벤트 패널 ──────────────────────────────────────────────

export async function eventPanelPayload() {
  const s = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const status = (on: boolean | undefined) => (on ? "🟢 진행 중" : "⚪ 진행 안 함");

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("event:checkin").setLabel("🗓️ 출석체크").setStyle(ButtonStyle.Primary).setDisabled(!s?.checkInEventEnabled),
    new ButtonBuilder().setCustomId("event:gacha").setLabel("🎰 룰렛 돌리기").setStyle(ButtonStyle.Primary).setDisabled(!s?.gachaEventEnabled)
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

  return buildPanel({
    title: "🎉 이벤트",
    description: "아래 버튼으로 진행 중인 이벤트에 바로 참여할 수 있어요.",
    fields: [
      { name: "🗓️ 출석체크", value: status(s?.checkInEventEnabled) },
      { name: "🎁 친구 초대", value: status(s?.referralEventEnabled) },
      { name: "🎰 룰렛/뽑기", value: `${status(s?.gachaEventEnabled)} (1회 ${s?.gachaCostPoints ?? 100}P)` },
    ],
    rows: [row1, row2],
  });
}

/** 이벤트 패널과는 별개로, 채널에 게시하는 화려한 홍보용 공지 (버튼 없음). */
export function eventPromoPayload() {
  return buildPanel({
    title: "🎉🎊 자비샵 신규 이벤트 4종 오픈! 🎊🎉",
    banner: true,
    description:
      "가만히 있어도, 친구를 데려와도, 운이 좋으면 대박까지! 지금 바로 참여해보세요 ✨\n(각 이벤트 진행 여부는 아래 패널에서 실시간으로 확인할 수 있어요)",
    fields: [
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
      },
    ],
    footer: "이벤트 패널에서 바로 참여할 수 있어요",
  });
}

// ── 인증 패널 ────────────────────────────────────────────────
// "인증하기"를 누르면 자체 호스팅한 /auth 페이지로 이동해 디스코드 OAuth 연결 +
// ALTCHA(자체 호스팅 캡챠)를 통과해야 역할이 지급된다 (예전엔 외부 서비스
// restore.salv.me로 보내거나, 테넌트는 클릭 즉시 아무 확인 없이 역할만 줬음).

export async function verifyPanelPayload() {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("인증하기").setStyle(ButtonStyle.Link).setURL(`${getAppOrigin()}/api/auth/discord/verify-start`)
  );
  return buildPanel({
    title: "💕 인증 채널 💕",
    description: "인증을 하시려면 아래 버튼을 클릭해 주세요",
    fields: settings?.verifyRoleId ? [{ name: "역할", value: `인증을 하시면 <@&${settings.verifyRoleId}> 역할이 부여돼요` }] : undefined,
    rows: [row],
  });
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

export async function categorySelectPayload() {
  const categories = await listProductCategories();
  const menu = new StringSelectMenuBuilder()
    .setCustomId("select:category")
    .setPlaceholder("카테고리를 선택하세요")
    .addOptions(categories.slice(0, 25).map((c) => ({ label: c, value: c })));

  return buildPanel({
    title: "🛍️ 구매하기",
    description: "카테고리를 선택하면 해당 카테고리의 상품 목록을 볼 수 있습니다.",
    rows: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });
}

export async function productSelectPayload(category?: string) {
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
        label:
          t.slug === SHOP_SUBSCRIPTION_TIER_SLUG
            ? `✨ ${t.name} (${t.price.toLocaleString()}원)`
            : `${t.name} (${t.price.toLocaleString()}원)`,
        description: t.slug === SHOP_SUBSCRIPTION_TIER_SLUG ? "🏪 프리미엄 · 무제한" : `재고 ${t._count.artworks}개`,
        emoji: t.slug === SHOP_SUBSCRIPTION_TIER_SLUG ? "🏪" : undefined,
        value: t.slug,
      }))
    );

  return buildPanel({
    title: category ? `🛍️ ${category} 상품 목록` : "🛍️ 상품 목록",
    description: "아래 메뉴에서 등급을 선택하면 상세 정보를 볼 수 있습니다.",
    rows: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });
}

export async function tierDetailPayload(slug: string) {
  const tier = await prisma.tier.findUnique({ where: { slug } });
  if (!tier) return null;

  // "자판기 통째로 구매"는 미리 채워둔 재고 개념이 없다 - 구매하는 순간 바로 만들어서
  // 지급하므로 항상 구매 가능하다.
  const isUnlimited = tier.slug === SHOP_SUBSCRIPTION_TIER_SLUG;
  const stock = isUnlimited ? 1 : await prisma.artwork.count({ where: { tierId: tier.id, status: ARTWORK_STATUS.AVAILABLE } });

  // "자판기 통째로 구매"는 수량/장바구니/재입고 개념이 없다 - 구매 버튼 하나만 두고,
  // 누르면(handleBuy) 원하는 샵 주소/이름을 입력받는 모달이 먼저 뜬다.
  const row = isUnlimited
    ? new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`buy:${slug}`).setLabel(`🏪 지금 바로 개설하기 · ${won(tier.price)}`).setStyle(ButtonStyle.Success)
      )
    : new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`buy:${slug}`).setLabel(`✅ ${won(tier.price)}로 구매`).setStyle(ButtonStyle.Success).setDisabled(stock === 0),
        new ButtonBuilder().setCustomId(`qtybuy:${slug}`).setLabel("🔢 수량 지정 구매").setStyle(ButtonStyle.Success).setDisabled(stock === 0),
        new ButtonBuilder().setCustomId(`cartadd:${slug}`).setLabel("🛒 장바구니 담기").setStyle(ButtonStyle.Secondary).setDisabled(stock === 0),
        new ButtonBuilder()
          .setCustomId(`restock:${slug}`)
          .setLabel("🔔 재입고 알림받기")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(stock > 0)
      );

  const payload = isUnlimited
    ? buildPanel({
        title: `🏪 ${tier.name}`,
        description:
          (tier.description || "이 디스코드 샵(자비샵)을 **통째로 복사**해서 내 이름으로 운영할 수 있는 상품입니다.") +
          "\n\n🌐 전용 웹사이트 · 🤖 전용 봇 · 🗄️ 전용 DB가 한 번에 생성됩니다.",
        banner: true,
        fields: [
          { name: "💰 이용료", value: `\`\`\`${won(tier.price)} / 월\`\`\`` },
          { name: "📦 재고 · ⏱️ 받는 시점", value: "♾️ 무제한 · 구매 즉시 자동 생성" },
          {
            name: "🎁 포함되는 것",
            value: "✔️ 전용 웹사이트\n✔️ 전용 디스코드 봇\n✔️ 관리자 패널\n✔️ 이벤트/쿠폰/포인트 기능 전부",
          },
        ],
        rows: [row],
        footer: "구매 즉시 자동 생성 · 결제일마다 자동 차감 · 언제든 해지 가능",
      })
    : buildPanel({
        title: tier.name,
        description: tier.description || undefined,
        fields: [
          { name: "가격", value: won(tier.price) },
          { name: "재고", value: `${stock}개` },
        ],
        rows: [row],
      });

  return { payload, stock };
}

// ── 포인트 / 장바구니 / 주문 / 쿠폰 ──────────────────────────

export function pointsPanelPayload(user: ShopUser, txs: { memo: string | null; type: string; amount: number }[]) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("modal:topup").setLabel("계좌이체 충전 신청").setStyle(ButtonStyle.Primary)
  );
  return buildPanel({
    title: "💰 내 포인트",
    description: `보유 포인트: **${pt(user.points)}**`,
    fields: txs.slice(0, 5).map((t) => ({ name: t.memo ?? t.type, value: `${t.amount >= 0 ? "+" : ""}${pt(t.amount)}` })),
    rows: [row],
  });
}

export function cartPanelPayload(items: { tier: { name: string; price: number }; quantity: number }[], hasItems: boolean) {
  let total = 0;
  const fields = items.map((item) => {
    const subtotal = item.tier.price * item.quantity;
    total += subtotal;
    return { name: item.tier.name, value: `${item.quantity}개 × ${pt(item.tier.price)} = ${pt(subtotal)}` };
  });
  if (items.length > 0) fields.push({ name: "합계", value: pt(total) });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("cart:checkout").setLabel("포인트로 결제").setStyle(ButtonStyle.Success).setDisabled(!hasItems)
  );
  return buildPanel({
    title: "🛒 내 장바구니",
    description: items.length === 0 ? "장바구니가 비어 있습니다." : undefined,
    fields,
    rows: [row],
  });
}

export function ordersPanelPayload(
  orders: { orderNo: string; tier: { name: string }; finalAmount: number; status: string; artwork: { title: string } | null }[]
) {
  return buildPanel({
    title: "📦 내 주문 내역",
    description: orders.length === 0 ? "주문 내역이 없습니다." : undefined,
    fields: orders.map((o) => ({
      name: `#${o.orderNo} · ${o.tier.name}`,
      value: `${pt(o.finalAmount)} · ${o.status}${o.artwork ? ` · ${o.artwork.title}` : ""}`,
    })),
  });
}

export function couponsPanelPayload(userCoupons: { coupon: { name: string; code: string; validTo: Date }; usedAt: Date | null }[]) {
  return buildPanel({
    title: "🎟️ 내 쿠폰함",
    description: userCoupons.length === 0 ? "보유한 쿠폰이 없습니다." : undefined,
    fields: userCoupons.map((uc) => ({
      name: `${uc.coupon.name} (${uc.coupon.code})`,
      value: `${uc.usedAt ? "사용완료" : "사용가능"} · ~${uc.coupon.validTo.toLocaleDateString("ko-KR")}`,
    })),
  });
}

// ── 관리자 패널 ──────────────────────────────────────────────

export async function adminPanelPayload() {
  const shopName = await getShopName();
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:topups").setLabel("💳 충전 대기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("admin:refunds").setLabel("💰 환불 대기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("admin:inquiries").setLabel("💬 문의 대기").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:stats").setLabel("📊 통계").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("admin:tiers").setLabel("📋 등급 목록").setStyle(ButtonStyle.Secondary)
  );
  return buildPanel({
    title: `🛠️ ${shopName} 관리자 패널`,
    description: "아래 버튼으로 승인 대기 항목과 통계를 바로 확인/처리할 수 있습니다.",
    rows: [row1, row2],
  });
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

  const container = startListContainer(
    "💳 대기 중인 충전 신청",
    totalPending === 0 ? "대기 중인 신청이 없습니다." : `총 ${totalPending}건 중 ${requests.length}건 표시 (버튼으로 바로 승인/거절)`
  );
  for (const r of requests) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`topup:approve:${r.id}`).setLabel(`승인 (${r.depositorName})`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`topup:reject:${r.id}`).setLabel("거절").setStyle(ButtonStyle.Danger)
    );
    addListItem(container, `**${r.amount.toLocaleString()}원 · 입금자: ${r.depositorName}**\n회원: ${r.user.name}`, row);
  }
  return finishContainer(container);
}

export async function pendingRefundsPayload() {
  const refunds = await prisma.refundRequest.findMany({
    where: { status: "PENDING" },
    include: { user: true, order: { include: { tier: true } } },
    orderBy: { createdAt: "asc" },
    take: MAX_ACTIONABLE_ITEMS,
  });
  const totalPending = await prisma.refundRequest.count({ where: { status: "PENDING" } });

  const container = startListContainer(
    "💰 대기 중인 환불 요청",
    totalPending === 0 ? "대기 중인 요청이 없습니다." : `총 ${totalPending}건 중 ${refunds.length}건 표시`
  );
  for (const r of refunds) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`refund:approve:${r.id}`).setLabel("승인").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refund:reject:${r.id}`).setLabel("거절").setStyle(ButtonStyle.Danger)
    );
    addListItem(
      container,
      `**#${r.order.orderNo} · ${r.order.tier.name} · ${pt(r.order.finalAmount)}**\n회원: ${r.user.name} · 사유: ${r.reason}`,
      row
    );
  }
  return finishContainer(container);
}

export async function pendingInquiriesPayload() {
  const inquiries = await prisma.inquiry.findMany({
    where: { status: "WAITING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
    take: MAX_ACTIONABLE_ITEMS,
  });
  const totalPending = await prisma.inquiry.count({ where: { status: "WAITING" } });

  const container = startListContainer(
    "💬 답변 대기 문의",
    totalPending === 0 ? "대기 중인 문의가 없습니다." : `총 ${totalPending}건 중 ${inquiries.length}건 표시`
  );
  for (const i of inquiries) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`inquiry:answer:${i.id}`).setLabel("답변하기").setStyle(ButtonStyle.Primary)
    );
    addListItem(container, `**${i.title} (${i.user.name})**\n${i.content.slice(0, 200)}`, row);
  }
  return finishContainer(container);
}

export async function tierListPayload() {
  const tiers = await prisma.tier.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { artworks: true } } },
  });
  // 한 TextDisplay당 글자 수 제한이 있어(약 4000자), 너무 많으면 잘라서 안내한다.
  const MAX_SHOWN = 40;
  const fields: APIEmbedField[] = tiers.slice(0, MAX_SHOWN).map((t) => ({
    name: `${t.name} (${t.slug})`,
    value: `${won(t.price)} · 재고 ${t._count.artworks}개 · ${t.status}${t.category ? ` · ${t.category}` : ""}`,
    inline: false,
  }));

  return buildPanel({
    title: "📋 등급 목록",
    description: tiers.length > MAX_SHOWN ? `전체 ${tiers.length}개 중 ${MAX_SHOWN}개만 표시됩니다.` : undefined,
    fields,
    accentColor: ACCENT_COLOR,
  });
}
