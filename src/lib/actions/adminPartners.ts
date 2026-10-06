"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { approvePartner, rejectPartner, PartnerError } from "@/lib/partners";

export async function approvePartnerAction(formData: FormData) {
  const admin = await requireAdmin();
  const partnerId = String(formData.get("partnerId") || "");
  try {
    // 이 프로세스가 자비샵 본인 것이면 자비샵 본인 서버, 테넌트 전용 프로세스면
    // /샵연동으로 연결한 그 샵의 서버 ID로 주입되어 있다 (provisionShop.ts 참고).
    await approvePartner(partnerId, admin.id, process.env.DISCORD_GUILD_ID);
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
