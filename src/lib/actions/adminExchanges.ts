"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { approveExchange, rejectExchange, ExchangeError } from "@/lib/exchanges";

export async function approveExchangeAction(formData: FormData) {
  const admin = await requireAdmin();
  const exchangeId = String(formData.get("exchangeId") || "");
  try {
    const result = await approveExchange(exchangeId, admin.id);
    await logAdminActivity(
      admin.id,
      "EXCHANGE_APPROVE",
      exchangeId,
      `${result.oldArtwork.code} → ${result.newArtwork.code}`
    );
  } catch (e) {
    if (!(e instanceof ExchangeError)) throw e;
  }
  revalidatePath("/admin/exchanges");
}

export async function rejectExchangeAction(formData: FormData) {
  const admin = await requireAdmin();
  const exchangeId = String(formData.get("exchangeId") || "");
  const note = String(formData.get("note") || "").trim() || undefined;
  try {
    await rejectExchange(exchangeId, admin.id, note);
    await logAdminActivity(admin.id, "EXCHANGE_REJECT", exchangeId, note);
  } catch (e) {
    if (!(e instanceof ExchangeError)) throw e;
  }
  revalidatePath("/admin/exchanges");
}
