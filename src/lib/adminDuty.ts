import { prisma } from "@/lib/prisma";
import { ADMIN_DUTY_STATUS, ADMIN_STATUS } from "@/lib/constants";

export const DUTY_STATUS_LABEL: Record<string, string> = {
  [ADMIN_DUTY_STATUS.ON_DUTY]: "🟢 출근",
  [ADMIN_DUTY_STATUS.OFF_DUTY]: "🔴 퇴근",
  [ADMIN_DUTY_STATUS.PAUSED]: "🟡 일시중지",
};

/** 관리자 패널에서 직접 누르는 수동 상태 변경. 어떤 상태로든 항상 바로 반영된다. */
export async function setAdminDutyStatus(adminId: string, status: string) {
  return prisma.adminUser.update({
    where: { id: adminId },
    data: { dutyStatus: status, dutyStatusUpdatedAt: new Date() },
  });
}

/**
 * 디스코드 presenceUpdate로 받은 온라인/오프라인 여부를 상태에 반영한다.
 * OFF_DUTY(퇴근)는 관리자가 명시적으로 선택한 "오늘은 끝" 상태라서, 단순히 온라인이
 * 됐다고 자동으로 깨우지 않는다 - 다시 출근하려면 패널에서 직접 눌러야 한다.
 */
export async function syncAdminDutyFromPresence(discordId: string, isOnline: boolean) {
  const admin = await prisma.adminUser.findUnique({ where: { discordId } });
  if (!admin || admin.status !== ADMIN_STATUS.ACTIVE) return null;
  if (admin.dutyStatus === ADMIN_DUTY_STATUS.OFF_DUTY) return null;

  const nextStatus = isOnline ? ADMIN_DUTY_STATUS.ON_DUTY : ADMIN_DUTY_STATUS.PAUSED;
  if (admin.dutyStatus === nextStatus) return null;

  return prisma.adminUser.update({
    where: { id: admin.id },
    data: { dutyStatus: nextStatus, dutyStatusUpdatedAt: new Date() },
  });
}

export async function listAdminDutyStatuses() {
  return prisma.adminUser.findMany({
    where: { status: ADMIN_STATUS.ACTIVE },
    orderBy: [{ dutyStatus: "asc" }, { name: "asc" }],
  });
}
