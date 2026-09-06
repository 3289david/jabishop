"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/actions/auth";
import { createReport } from "@/lib/reports";

export type ActionState = { error?: string; success?: string } | undefined;

export async function createReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const targetType = String(formData.get("targetType") || "OTHER");
  const targetId = String(formData.get("targetId") || "");
  const reason = String(formData.get("reason") || "").trim();
  const detail = String(formData.get("detail") || "").trim() || null;

  if (!reason) return { error: "신고 사유를 입력해주세요." };

  await createReport(user.id, targetType, targetId, reason, detail);
  revalidatePath("/mypage/reports");
  return { success: "신고가 접수되었습니다." };
}
