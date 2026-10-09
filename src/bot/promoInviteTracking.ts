import type { Client, Guild } from "discord.js";
import { prisma } from "@/lib/prisma";
import { runForGuild } from "@/lib/shop";

// 디스코드는 "신규 멤버가 어떤 초대 링크로 들어왔는지"를 멤버 입장 이벤트에 직접 넘겨주지
// 않는다 - 그래서 길드별로 초대 코드마다 사용 횟수(uses)를 캐시해두고, 새 멤버가 들어올
// 때마다 다시 조회해서 어느 코드의 사용 횟수가 늘었는지 비교(diff)하는 방식으로 추정한다.
// (동시에 여러 명이 입장하면 가끔 틀릴 수 있지만, 홍보직원 정산은 참고용 추정치라 허용한다.)
const inviteUsesCache = new Map<string, Map<string, number>>();

async function cacheGuildInvites(guild: Guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, number>();
    for (const inv of invites.values()) map.set(inv.code, inv.uses ?? 0);
    inviteUsesCache.set(guild.id, map);
    return map;
  } catch {
    // MANAGE_GUILD 권한이 없으면 초대 목록을 못 본다 - 이 기능만 조용히 동작 안 함.
    return null;
  }
}

/** 봇 시작 시 현재 가입된 모든 길드의 초대 사용 횟수를 초기 캐시해둔다. */
export async function startPromoInviteTracking(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }

  client.on("guildMemberAdd", async (member) => {
    const guild = member.guild;
    const before = inviteUsesCache.get(guild.id) ?? new Map<string, number>();
    const after = await cacheGuildInvites(guild);
    if (!after) return;

    let usedCode: string | null = null;
    for (const [code, uses] of after) {
      if (uses > (before.get(code) ?? 0)) {
        usedCode = code;
        break;
      }
    }
    if (!usedCode) return;

    await runForGuild(guild.id, async () => {
      const staff = await prisma.promoStaff.findFirst({ where: { inviteCode: usedCode!, status: "ACTIVE" } });
      if (!staff) return;
      await prisma.promoInvite
        .upsert({
          where: { discordUserId: member.id },
          create: { promoStaffId: staff.id, discordUserId: member.id },
          update: {},
        })
        .catch(() => {});
    }).catch((e) => console.error("홍보직원 초대 집계 실패:", e));
  });
}
