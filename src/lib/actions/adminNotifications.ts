"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";

export type ActionState = { error?: string; success?: string } | undefined;

export async function sendBroadcastAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const title = String(formData.get("title") || "").trim();
  const message = String(formData.get("message") || "").trim();
  if (!title || !message) return { error: "제목과 내용을 입력해주세요." };

  await prisma.notification.create({
    data: { type: "NOTICE", title, message, broadcast: true },
  });
  await logAdminActivity(admin.id, "NOTICE_BROADCAST", undefined, title);
  revalidatePath("/admin/notifications");
  return { success: "전체 공지가 발송되었습니다." };
}
