import { prisma } from "@/lib/prisma";
import {
  createPermanentInvite,
  deleteGuildInvite,
  sendDiscordDM,
  getCumulativeSpend,
  addGuildMemberRole,
  removeGuildMemberRole,
  guildMemberHasRole,
} from "@/lib/discordNotify";
import { buildV2Panel } from "@/lib/panelV2";

export class PromoStaffError extends Error {}

// 초대된 사람이 인증 역할(ShopSetting.verifyRoleId)을 얻어야 1명당 100원이 집계되고,
// 그중 500원 이상 쓴 사람마다 추가로 200원 - 실제 지급은 관리자가 매주 금요일 보고
// DM을 받고 수동으로 계좌 송금한다 (이 모듈은 "얼마 줘야 하는지"만 계산).
export const PROMO_PER_INVITE_REWARD = 100;
export const PROMO_PER_SPENDER_BONUS = 200;
export const PROMO_SPENDER_THRESHOLD = 500;

/** 새 홍보직원을 등록하고(또는 제거됐던 사람을 재등록하고), 영구 초대 링크를 DM으로 보낸다. */
export async function addPromoStaff(params: { discordUserId: string; name: string; guildId: string }) {
  const { discordUserId, name, guildId } = params;
  const existing = await prisma.promoStaff.findUnique({ where: { discordUserId } });
  if (existing?.status === "ACTIVE") throw new PromoStaffError("이미 홍보직원으로 등록된 사용자입니다.");

  const invite = await createPermanentInvite(guildId);
  if (!invite) throw new PromoStaffError("초대 링크 생성에 실패했습니다 - 봇의 서버 권한(초대 생성)을 확인해주세요.");

  const staff = existing
    ? await prisma.promoStaff.update({
        where: { id: existing.id },
        data: { name, inviteCode: invite.code, inviteChannelId: invite.channelId, status: "ACTIVE", removedAt: null },
      })
    : await prisma.promoStaff.create({
        data: { discordUserId, name, inviteCode: invite.code, inviteChannelId: invite.channelId },
      });

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (settings?.promoStaffRoleId) {
    await addGuildMemberRole(guildId, discordUserId, settings.promoStaffRoleId).catch(() => {});
  }

  await sendDiscordDM(
    discordUserId,
    buildV2Panel({
      title: "🎉 홍보직원으로 등록되었습니다",
      description:
        `아래 영구 링크로 서버에 들어온 사람 수만큼 보상이 계산됩니다.\n` +
        `- 인증까지 완료한 1명당 ${PROMO_PER_INVITE_REWARD}원 (서버 입장만 하고 인증 안 하면 집계되지 않음)\n` +
        `- 그중 ${PROMO_SPENDER_THRESHOLD}원 이상 구매한 사람마다 ${PROMO_PER_SPENDER_BONUS}원 추가\n\n` +
        `**영구 초대 링크:** https://discord.gg/${invite.code}\n\n` +
        `디스코드에서 \`/홍보실적 계좌등록\` 명령어로 정산받을 계좌를 등록해주세요. ` +
        `매주 금요일 관리자에게 실적과 지급액이 안내되고, 계좌로 수동 송금됩니다.`,
    })
  );

  return staff;
}

/** 홍보직원을 그만두게 한다 - 초대 링크를 무효화하고, 지급했던 역할도 회수한다 (실적 기록은 남긴다). */
export async function removePromoStaff(discordUserId: string, guildId: string) {
  const staff = await prisma.promoStaff.findUnique({ where: { discordUserId } });
  if (!staff || staff.status !== "ACTIVE") throw new PromoStaffError("활동 중인 홍보직원이 아닙니다.");

  await deleteGuildInvite(staff.inviteCode).catch(() => {});

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (settings?.promoStaffRoleId) {
    await removeGuildMemberRole(guildId, discordUserId, settings.promoStaffRoleId).catch(() => {});
  }
  await prisma.promoStaff.update({ where: { id: staff.id }, data: { status: "REMOVED", removedAt: new Date() } });
}

/**
 * 이 홍보직원의 초대 수 / 그중 인증(ShopSetting.verifyRoleId)된 인원 수(=100원 집계 대상) /
 * 그중 500원 이상 구매자 수 / 지급해야 할 금액을 계산한다.
 */
export async function computePromoStaffStats(staffId: string, guildId?: string) {
  const resolvedGuildId = guildId ?? process.env.DISCORD_GUILD_ID;
  const invites = await prisma.promoInvite.findMany({ where: { promoStaffId: staffId } });
  const inviteCount = invites.length;
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const verifyRoleId = settings?.verifyRoleId;

  let verifiedCount = 0;
  let qualifyingCount = 0;
  for (const inv of invites) {
    if (verifyRoleId && resolvedGuildId) {
      const verified = await guildMemberHasRole(resolvedGuildId, inv.discordUserId, verifyRoleId);
      if (verified) verifiedCount++;
    }

    const user = await prisma.user.findFirst({ where: { discordId: inv.discordUserId } });
    if (!user) continue;
    const spend = await getCumulativeSpend(user.id);
    if (spend >= PROMO_SPENDER_THRESHOLD) qualifyingCount++;
  }

  const amountDue = verifiedCount * PROMO_PER_INVITE_REWARD + qualifyingCount * PROMO_PER_SPENDER_BONUS;
  return { inviteCount, verifiedCount, qualifyingCount, amountDue };
}

/** 홍보직원 본인이 정산받을 계좌 정보를 등록/수정한다. */
export async function registerPromoStaffBank(
  discordUserId: string,
  bankName: string,
  bankAccountNumber: string,
  accountHolder: string
) {
  const staff = await prisma.promoStaff.findUnique({ where: { discordUserId } });
  if (!staff || staff.status !== "ACTIVE") throw new PromoStaffError("홍보직원으로 등록되지 않았습니다.");
  await prisma.promoStaff.update({ where: { id: staff.id }, data: { bankName, bankAccountNumber, accountHolder } });
}
