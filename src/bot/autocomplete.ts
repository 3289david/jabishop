import type { AutocompleteInteraction } from "discord.js";
import { prisma } from "@/lib/prisma";
import { RAFFLE_STATUS } from "@/lib/constants";
import { listUsableCoupons } from "@/lib/coupon";

export async function tierAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toString();
  // 예전에는 전체 등급을 sortOrder asc로 가져온 뒤 자바스크립트에서 25개로 잘랐다.
  // 등급이 25개를 넘어가고(특히 이름이 겹치는 "스킨 ..." 계열이 많아지면서) sortOrder가
  // 대부분 0으로 동일해 정렬 순서가 불안정했고, 그 결과 방금 새로 만든 등급이 잘려서
  // 자동완성에 아예 안 뜨는 문제가 있었다. DB 단계에서 검색어로 먼저 필터링하고
  // 최신순으로 정렬해서 가져오면, 새로 만든 등급도 검색어만 맞으면 항상 최상단에 뜬다.
  const tiers = await prisma.tier.findMany({
    where: focused ? { OR: [{ name: { contains: focused } }, { slug: { contains: focused } }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  await interaction.respond(
    tiers.map((t) => ({ name: `${t.name} (${t.price.toLocaleString()}원)`, value: t.slug }))
  );
}

/** /구매의 "쿠폰코드" 옵션 자동완성 - 자동 적용 없이, 지금 쓸 수 있는 쿠폰을 직접 고르게 한다. */
export async function couponAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toString().toLowerCase();
  const slug = interaction.options.getString("등급");
  const user = slug ? await prisma.user.findUnique({ where: { discordId: interaction.user.id } }) : null;
  const tier = slug ? await prisma.tier.findUnique({ where: { slug } }) : null;
  if (!user || !tier) return interaction.respond([]);

  const usable = await listUsableCoupons(user.id, tier.id, tier.price);
  const filtered = usable
    .filter(({ coupon }) => coupon.code.toLowerCase().includes(focused) || coupon.name.toLowerCase().includes(focused))
    .slice(0, 25);
  await interaction.respond(
    filtered.map(({ coupon, discount }) => ({
      name: `${coupon.name} (${coupon.code}) - ${discount.toLocaleString()}원 할인`,
      value: coupon.code,
    }))
  );
}

/** /구매는 "등급"과 "쿠폰코드" 둘 다 자동완성을 쓰므로, 지금 입력 중인 옵션이 뭔지 보고 분기한다. */
export async function purchaseAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "쿠폰코드") return couponAutocomplete(interaction);
  return tierAutocomplete(interaction);
}

/** 판매자 관리 명령어들의 "판매자" 옵션 자동완성 - 상점이름/디스코드태그로 검색, value는 Seller.id. */
export async function sellerAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toString();
  const sellers = await prisma.seller.findMany({
    where: focused ? { OR: [{ storeName: { contains: focused } }, { discordTag: { contains: focused } }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  await interaction.respond(
    sellers.map((s) => ({ name: `${s.storeName} (${s.discordTag}) - ${s.status}`, value: s.id }))
  );
}

export async function openRaffleAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toString();
  const raffles = await prisma.raffleEvent.findMany({
    where: { status: RAFFLE_STATUS.OPEN },
    orderBy: { createdAt: "desc" },
  });
  const filtered = raffles.filter((r) => r.title.includes(focused)).slice(0, 25);
  await interaction.respond(filtered.map((r) => ({ name: r.title, value: r.id })));
}
