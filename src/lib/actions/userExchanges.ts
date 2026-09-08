"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/actions/auth";
import { requestExchange, ExchangeError } from "@/lib/exchanges";
import { saveUploadedFile } from "@/lib/storage";

export type ActionState = { error?: string; success?: string } | undefined;

export async function requestExchangeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") || "");
  const reason = String(formData.get("reason") || "").trim();
  const proof = formData.get("proof") as File | null;
  if (!reason) return { error: "교환 사유를 입력해주세요." };
  if (!proof || proof.size === 0) return { error: "증빙 파일(스크린샷 등)을 첨부해주세요." };

  const proofFileKey = await saveUploadedFile(proof, "attachments");

  try {
    await requestExchange(orderId, user.id, reason, proofFileKey);
  } catch (e) {
    if (e instanceof ExchangeError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/mypage/orders/${orderId}`);
  return { success: "교환 신청이 접수되었습니다. 관리자 승인 후 새 계정이 지급됩니다." };
}
