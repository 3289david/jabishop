"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/actions/auth";
import { requestRefund, RefundError } from "@/lib/refunds";

export type ActionState = { error?: string; success?: string } | undefined;

export async function requestRefundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) return { error: "환불 사유를 입력해주세요." };

  try {
    await requestRefund(orderId, user.id, reason);
  } catch (e) {
    if (e instanceof RefundError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/mypage/orders/${orderId}`);
  return { success: "환불 신청이 접수되었습니다." };
}
