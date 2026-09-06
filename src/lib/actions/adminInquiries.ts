"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";

export type ActionState = { error?: string } | undefined;

export async function answerInquiryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const answer = String(formData.get("answer") || "").trim();
  const status = String(formData.get("status") || "ANSWERED");

  if (!answer) return { error: "답변 내용을 입력해주세요." };

  const inquiry = await prisma.inquiry.update({
    where: { id },
    data: { answer, status, answeredByAdminId: admin.id, answeredAt: new Date() },
  });
  await prisma.notification.create({
    data: {
      userId: inquiry.userId,
      type: "INQUIRY_ANSWERED",
      title: "문의 답변 완료",
      message: `"${inquiry.title}" 문의에 답변이 등록되었습니다.`,
    },
  });
  await logAdminActivity(admin.id, "INQUIRY_ANSWER", id);
  revalidatePath(`/admin/inquiries/${id}`);
  revalidatePath("/admin/inquiries");
  return undefined;
}
