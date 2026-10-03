import { prisma } from "@/lib/prisma";
import { ADMIN_DUTY_STATUS } from "@/lib/constants";

export const DUTY_STATUS_LABEL: Record<string, string> = {
  [ADMIN_DUTY_STATUS.ON_DUTY]: "🟢 출근",
  [ADMIN_DUTY_STATUS.OFF_DUTY]: "🔴 퇴근",
  [ADMIN_DUTY_STATUS.PAUSED]: "🟡 일시중지",
};

// 이 패널은 웹 관리자 계정(AdminUser) 연동 여부와 무관하게, 디스코드 서버에서 관리자
// 역할(DISCORD_ADMIN_ROLE_ID)을 가진 사람이면 누구나 대상이다. discordId를 키로 쓴다.

/** 관리자 패널에서 직접 누르는 수동 상태 변경. 어떤 상태로든 항상 바로 반영된다. */
export async function setAdminDutyStatus(discordId: string, name: string, status: string) {
  return prisma.adminDutyStatus.upsert({
    where: { discordId },
    update: { status, name },
    create: { discordId, name, status },
  });
}

/**
 * 디스코드 presenceUpdate로 받은 온라인/오프라인 여부를 상태에 반영한다.
 * OFF_DUTY(퇴근)는 관리자가 명시적으로 선택한 "오늘은 끝" 상태라서, 단순히 온라인이
 * 됐다고 자동으로 깨우지 않는다 - 다시 출근하려면 패널에서 직접 눌러야 한다.
 * 호출하는 쪽(봇)에서 이미 "관리자 역할을 가진 사람"인지 확인하고 넘겨준다.
 */
export async function syncAdminDutyFromPresence(discordId: string, name: string, isOnline: boolean) {
  const existing = await prisma.adminDutyStatus.findUnique({ where: { discordId } });
  if (existing?.status === ADMIN_DUTY_STATUS.OFF_DUTY) {
    // 퇴근 상태는 고정 - 닉네임만 최신으로 맞춰두고 상태는 건드리지 않는다.
    if (existing.name !== name) await prisma.adminDutyStatus.update({ where: { discordId }, data: { name } });
    return null;
  }

  const nextStatus = isOnline ? ADMIN_DUTY_STATUS.ON_DUTY : ADMIN_DUTY_STATUS.PAUSED;
  if (existing?.status === nextStatus && existing.name === name) return null;

  return prisma.adminDutyStatus.upsert({
    where: { discordId },
    update: { status: nextStatus, name },
    create: { discordId, name, status: nextStatus },
  });
}

/**
 * 관리자 역할을 가진 사람 목록(디스코드에서 가져온 최신 정보)과 DB에 저장된 상태를
 * 맞춰준다 - 새로 역할을 받은 사람은 OFF_DUTY로 등록하고, 역할을 잃은 사람은 목록에서
 * 뺀다. 5분 주기 보정 루프와 패널 최초 게시 시 호출한다.
 */
export async function reconcileAdminDutyRoster(members: { discordId: string; name: string }[]) {
  const currentIds = members.map((m) => m.discordId);
  await prisma.adminDutyStatus.deleteMany({ where: { discordId: { notIn: currentIds } } });
  for (const m of members) {
    await prisma.adminDutyStatus.upsert({
      where: { discordId: m.discordId },
      update: { name: m.name },
      create: { discordId: m.discordId, name: m.name, status: ADMIN_DUTY_STATUS.OFF_DUTY },
    });
  }
}

export async function listAdminDutyStatuses() {
  return prisma.adminDutyStatus.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
}
