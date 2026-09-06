"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { ORDER_STATUS, ARTWORK_STATUS } from "@/lib/constants";

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
