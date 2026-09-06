"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/actions/auth";
import { ORDER_STATUS } from "@/lib/constants";

export type ActionState = { error?: string; success?: string } | undefined;

export async function createReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") || "");
  const rating = Math.min(5, Math.max(1, Number(formData.get("rating") || 5)));
  const content = String(formData.get("content") || "").trim();

  if (content.length < 5) return { error: "리뷰 내용을 5자 이상 입력해주세요." };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) return { error: "주문을 찾을 수 없습니다." };
  if (order.status !== ORDER_STATUS.COMPLETED) return { error: "구매가 완료된 주문만 리뷰를 작성할 수 있습니다." };

  const existing = await prisma.review.findUnique({ where: { orderId } });
  if (existing) return { error: "이미 리뷰를 작성한 주문입니다." };

  await prisma.review.create({
    data: { userId: user.id, orderId, rating, content, purchaseVerified: true },
  });
  revalidatePath(`/mypage/orders/${orderId}`);
  return { success: "리뷰가 등록되었습니다." };
}

export async function deleteReviewAction(formData: FormData) {
  const user = await requireUser();
  const reviewId = String(formData.get("reviewId") || "");
  await prisma.review.deleteMany({ where: { id: reviewId, userId: user.id } });
  revalidatePath("/mypage");
}
