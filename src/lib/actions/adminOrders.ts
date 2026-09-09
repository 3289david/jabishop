"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { ORDER_STATUS, ARTWORK_STATUS } from "@/lib/constants";
import { exchangeOrderArtwork, OrderError } from "@/lib/orders";

export type ActionState = { error?: string; success?: string } | undefined;

export async function forceCancelOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") || "");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.RESERVED].includes(order.status as never)) return;

  await prisma.$transaction(async (tx) => {
    await tx.artwork.updateMany({
      where: { reservedOrderId: order.id },
      data: { status: ARTWORK_STATUS.AVAILABLE, reservedOrderId: null, reservedAt: null },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: ORDER_STATUS.CANCELLED, cancelledAt: new Date(), cancelReason: "관리자 취소" },
    });
  });

  await logAdminActivity(admin.id, "ORDER_CANCEL", orderId);
  revalidatePath("/admin/orders");
}

// 관리자 원클릭 교환 - 교환 신청/승인 절차 없이 즉시 재추첨한다 (긴급 처리용, 신청→승인 흐름과 별도로 유지).
export async function exchangeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") || "");

  try {
    const result = await exchangeOrderArtwork(orderId);
    await logAdminActivity(
      admin.id,
      "ORDER_EXCHANGE",
      orderId,
      `${result.oldArtwork.code} → ${result.newArtwork.code}`
    );
    revalidatePath(`/admin/orders/${orderId}`);
    return { success: `${result.newArtwork.code}로 교환되어 재발송되었습니다.` };
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }
}
