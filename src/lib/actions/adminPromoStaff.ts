"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { addPromoStaff, removePromoStaff, PromoStaffError } from "@/lib/promoStaff";

function requireGuildId(): string {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new PromoStaffError("이 서버의 디스코드 길드 ID가 설정되지 않았습니다.");
  return guildId;
}

export async function addPromoStaffAction(formData: FormData) {
  const admin = await requireAdmin();
  const discordUserId = String(formData.get("discordUserId") || "").trim();
  const name = String(formData.get("name") || "").trim();

  if (/^\d{5,25}$/.test(discordUserId) && name) {
    try {
      await addPromoStaff({ discordUserId, name, guildId: requireGuildId() });
      await logAdminActivity(admin.id, "PROMO_STAFF_ADD", discordUserId, name);
    } catch (e) {
      if (!(e instanceof PromoStaffError)) throw e;
    }
  }
  revalidatePath("/admin/promo-staff");
}

export async function removePromoStaffAction(formData: FormData) {
  const admin = await requireAdmin();
  const discordUserId = String(formData.get("discordUserId") || "");
  try {
    await removePromoStaff(discordUserId, requireGuildId());
    await logAdminActivity(admin.id, "PROMO_STAFF_REMOVE", discordUserId);
  } catch (e) {
    if (!(e instanceof PromoStaffError)) throw e;
  }
  revalidatePath("/admin/promo-staff");
}
