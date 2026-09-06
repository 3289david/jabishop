"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { confirmTopUp, rejectTopUp, TopUpError } from "@/lib/points";

export type ActionState = { error?: string } | undefined;

export async function confirmTopUpAction(formData: FormData) {
  const admin = await requireAdmin();
  const topUpId = String(formData.get("topUpId") || "");
  try {
    await confirmTopUp(topUpId, admin.id);
    await logAdminActivity(admin.id, "TOPUP_CONFIRM", topUpId);
  } catch (e) {
    if (!(e instanceof TopUpError)) throw e;
  }
  revalidatePath("/admin/payments");
}

export async function rejectTopUpAction(formData: FormData) {
  const admin = await requireAdmin();
  const topUpId = String(formData.get("topUpId") || "");
  const note = String(formData.get("note") || "").trim() || undefined;
  try {
    await rejectTopUp(topUpId, admin.id, note);
    await logAdminActivity(admin.id, "TOPUP_REJECT", topUpId, note);
  } catch (e) {
    if (!(e instanceof TopUpError)) throw e;
  }
  revalidatePath("/admin/payments");
}
