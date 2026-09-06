import { prisma } from "@/lib/prisma";
import { notifyAdminsNewPendingItem } from "@/lib/discordNotify";

export async function createReport(
  reporterId: string,
  targetType: string,
  targetId: string,
  reason: string,
  detail?: string | null
) {
  const reporter = await prisma.user.findUnique({ where: { id: reporterId } });
  const report = await prisma.report.create({
    data: {
      reporterId,
      targetType,
      targetId,
      reviewTargetId: targetType === "REVIEW" ? targetId : null,
      reason,
      detail: detail ?? null,
    },
  });

  notifyAdminsNewPendingItem("신고", `**${reporter?.name ?? "회원"}** → ${targetType}: ${reason}`).catch(() => {});

  return report;
}
