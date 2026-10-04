import { prisma, runWithTenant } from "@/lib/prisma";

/**
 * "자판기 판매"로 생긴 테넌트 샵들을 디스코드 길드 ID로 찾는다. 항상 자비샵 본인 DB
 * (Shop 레지스트리가 있는 곳)를 기준으로 조회한다 - runWithTenant 안에서 불러도 안전.
 */
export async function resolveShopByGuildId(guildId: string | null) {
  if (!guildId) return null;
  return runWithTenant(null, () => prisma.shop.findUnique({ where: { discordGuildId: guildId } }));
}

/**
 * 디스코드 인터랙션/메시지가 어느 길드에서 왔는지 보고, 그게 등록된 테넌트 샵이면
 * 그 샵의 DB로, 아니면(=자비샵 본인 서버, 또는 아직 등록 안 된 서버) 그냥 평소대로
 * 자비샵 본인 DB로 fn을 실행한다. 봇 코드 어디를 고칠 필요 없이, 인터랙션/메시지
 * 디스패처 진입점 한 곳에서만 이걸로 감싸면 된다.
 */
export async function runForGuild<T>(guildId: string | null, fn: () => Promise<T>): Promise<T> {
  const shop = await resolveShopByGuildId(guildId);
  if (!shop || shop.status !== "ACTIVE") return fn();
  return runWithTenant(shop.dbPath, fn);
}

export type ShopContext = { dbPath: string | null; guildId: string | null };

/**
 * 봇의 주기적 백그라운드 작업(통계 채널 갱신, 일일 공지, 이벤트 자동 마감 등)을
 * 자비샵 본인뿐 아니라 연동이 끝난(= discordGuildId가 있는) 테넌트 샵 전부에 대해서도
 * 돌리기 위한 목록. 항상 자비샵 본인(dbPath: null)이 먼저 오고, 그 다음 각 테넌트 샵이 온다.
 */
export async function listShopContexts(): Promise<ShopContext[]> {
  const tenants = await runWithTenant(null, () =>
    prisma.shop.findMany({ where: { status: "ACTIVE", discordGuildId: { not: null } } })
  );
  return [
    { dbPath: null, guildId: process.env.DISCORD_GUILD_ID ?? null },
    ...tenants.map((t) => ({ dbPath: t.dbPath, guildId: t.discordGuildId })),
  ];
}

/** listShopContexts()로 돈 각 샵에 대해 fn(guildId)을 그 샵의 DB로 실행한다. 하나가 실패해도 나머지는 계속 돈다. */
export async function forEachShop(fn: (guildId: string | null) => Promise<unknown>): Promise<void> {
  const contexts = await listShopContexts();
  for (const ctx of contexts) {
    await runWithTenant(ctx.dbPath, () => fn(ctx.guildId)).catch((e) =>
      console.error(`샵 작업 실패 (dbPath=${ctx.dbPath ?? "default"}):`, e)
    );
  }
}
