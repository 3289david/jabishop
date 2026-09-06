"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/actions/auth";
import { createTopUpRequest } from "@/lib/points";

export type ActionState = { error?: string; success?: string } | undefined;

export async function requestTopUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const amount = Number(formData.get("amount") || 0);
  const depositorName = String(formData.get("depositorName") || "").trim();

  if (!Number.isFinite(amount) || amount < 1000) return { error: "1,000원 이상만 충전 신청이 가능합니다." };
  if (!depositorName) return { error: "입금자명을 입력해주세요." };

  await createTopUpRequest(user.id, amount, depositorName);
  revalidatePath("/mypage/points");
  return { success: "충전 신청이 접수되었습니다. 입금 확인 후 포인트가 지급됩니다." };
}
