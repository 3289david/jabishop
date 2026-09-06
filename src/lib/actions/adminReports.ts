"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";

export async function resolveReportAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const processResult = String(formData.get("processResult") || "").trim() || null;
  await prisma.report.update({
    where: { id },
    data: { status: "RESOLVED", processedByAdminId: admin.id, processResult, processedAt: new Date() },
  });
  await logAdminActivity(admin.id, "REPORT_RESOLVE", id, processResult ?? undefined);
  revalidatePath("/admin/reports");
}

export async function rejectReportAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.report.update({
    where: { id },
    data: { status: "REJECTED", processedByAdminId: admin.id, processedAt: new Date() },
  });
  await logAdminActivity(admin.id, "REPORT_REJECT", id);
  revalidatePath("/admin/reports");
}
