import type { AutocompleteInteraction } from "discord.js";
import { prisma } from "@/lib/prisma";
import { RAFFLE_STATUS } from "@/lib/constants";

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

export async function openRaffleAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toString();
  const raffles = await prisma.raffleEvent.findMany({
    where: { status: RAFFLE_STATUS.OPEN },
    orderBy: { createdAt: "desc" },
  });
  const filtered = raffles.filter((r) => r.title.includes(focused)).slice(0, 25);
  await interaction.respond(filtered.map((r) => ({ name: r.title, value: r.id })));
}
