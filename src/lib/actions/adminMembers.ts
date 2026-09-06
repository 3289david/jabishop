"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { adjustPoints, TopUpError } from "@/lib/points";

export type ActionState = { error?: string; success?: string } | undefined;

export async function updateMemberStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const status = String(formData.get("status") || "ACTIVE");
  const suspendedReason = String(formData.get("suspendedReason") || "").trim() || null;
  const adminMemo = String(formData.get("adminMemo") || "").trim() || null;

  await prisma.user.update({ where: { id: userId }, data: { status, suspendedReason, adminMemo } });
  await logAdminActivity(admin.id, "MEMBER_STATUS_UPDATE", userId, status);
  revalidatePath(`/admin/members/${userId}`);
  return { success: "저장되었습니다." };
}

export async function adminAdjustPointsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const amount = Number(formData.get("amount") || 0);
  const memo = String(formData.get("memo") || "").trim();

  if (!amount || !memo) return { error: "금액과 사유를 입력해주세요." };

  try {
    await adjustPoints(userId, amount, memo);
  } catch (e) {
    if (e instanceof TopUpError) return { error: e.message };
    throw e;
  }
  await logAdminActivity(admin.id, "POINT_ADMIN_ADJUST", userId, `${amount}P: ${memo}`);
  revalidatePath(`/admin/members/${userId}`);
  return { success: "포인트가 조정되었습니다." };
}
