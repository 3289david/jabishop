"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { approveRefund, rejectRefund, RefundError } from "@/lib/refunds";

export async function approveRefundAction(formData: FormData) {
  const admin = await requireAdmin();
  const refundId = String(formData.get("refundId") || "");
  try {
    await approveRefund(refundId, admin.id);
    await logAdminActivity(admin.id, "REFUND_APPROVE", refundId);
  } catch (e) {
    if (!(e instanceof RefundError)) throw e;
  }
  revalidatePath("/admin/refunds");
}

export async function rejectRefundAction(formData: FormData) {
  const admin = await requireAdmin();
  const refundId = String(formData.get("refundId") || "");
  const note = String(formData.get("note") || "").trim() || undefined;
  try {
    await rejectRefund(refundId, admin.id, note);
    await logAdminActivity(admin.id, "REFUND_REJECT", refundId, note);
  } catch (e) {
    if (!(e instanceof RefundError)) throw e;
  }
  revalidatePath("/admin/refunds");
}
