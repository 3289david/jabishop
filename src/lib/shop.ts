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
