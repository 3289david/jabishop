"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { approvePartner, rejectPartner, PartnerError } from "@/lib/partners";

export async function approvePartnerAction(formData: FormData) {
  const admin = await requireAdmin();
  const partnerId = String(formData.get("partnerId") || "");
  try {
    await approvePartner(partnerId, admin.id);
    await logAdminActivity(admin.id, "PARTNER_APPROVE", partnerId);
  } catch (e) {
    if (!(e instanceof PartnerError)) throw e;
  }
  revalidatePath("/admin/partners");
}

export async function rejectPartnerAction(formData: FormData) {
  const admin = await requireAdmin();
  const partnerId = String(formData.get("partnerId") || "");
  try {
    await rejectPartner(partnerId, admin.id);
    await logAdminActivity(admin.id, "PARTNER_REJECT", partnerId);
  } catch (e) {
    if (!(e instanceof PartnerError)) throw e;
  }
  revalidatePath("/admin/partners");
}
