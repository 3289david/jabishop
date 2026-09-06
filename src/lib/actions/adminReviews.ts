"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";

export async function toggleReviewVisibilityAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return;
  const nextStatus = review.status === "VISIBLE" ? "HIDDEN" : "VISIBLE";
  await prisma.review.update({ where: { id }, data: { status: nextStatus } });
  await logAdminActivity(admin.id, "REVIEW_VISIBILITY", id, nextStatus);
  revalidatePath("/admin/reviews");
}

export async function deleteReviewAdminAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.review.delete({ where: { id } }).catch(() => {});
  await logAdminActivity(admin.id, "REVIEW_DELETE", id);
  revalidatePath("/admin/reviews");
}
