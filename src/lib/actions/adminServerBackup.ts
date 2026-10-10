"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { prisma } from "@/lib/prisma";

function requireGuildId(): string {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("이 서버의 디스코드 길드 ID가 설정되지 않았습니다.");
  return guildId;
}

export async function createBackupAction() {
  const admin = await requireAdmin();
  await prisma.serverBackup.create({
    data: { guildId: requireGuildId(), label: new Date().toLocaleString("ko-KR") },
  });
  await logAdminActivity(admin.id, "SERVER_BACKUP_CREATE");
  revalidatePath("/admin/server-backup");
}

export async function restoreSameServerAction(formData: FormData) {
  const admin = await requireAdmin();
  const backupId = String(formData.get("backupId") || "");
  const backup = await prisma.serverBackup.findUnique({ where: { id: backupId } });
  if (backup) {
    await prisma.restoreJob.create({
      data: { backupId: backup.id, targetGuildId: backup.guildId, mode: "RESTORE_SAME" },
    });
    await logAdminActivity(admin.id, "SERVER_BACKUP_RESTORE_SAME", backupId);
  }
  revalidatePath("/admin/server-backup");
}

export async function cloneToNewServerAction(formData: FormData) {
  const admin = await requireAdmin();
  const backupId = String(formData.get("backupId") || "");
  const targetGuildId = String(formData.get("targetGuildId") || "").trim();
  if (backupId && /^\d{5,25}$/.test(targetGuildId)) {
    await prisma.restoreJob.create({ data: { backupId, targetGuildId, mode: "CLONE_NEW" } });
    await logAdminActivity(admin.id, "SERVER_BACKUP_CLONE", backupId, targetGuildId);
  }
  revalidatePath("/admin/server-backup");
}
