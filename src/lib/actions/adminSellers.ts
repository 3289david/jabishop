"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import {
  approveSeller,
  rejectSeller,
  suspendSeller,
  restoreSeller,
  expelSeller,
  extendSeller,
  SellerError,
} from "@/lib/sellers";

// 이 프로세스가 자비샵 본인 것이면 자비샵 본인 서버, 테넌트 전용 프로세스면 /샵연동으로
// 연결한 그 샵의 서버 ID로 주입되어 있다 (provisionShop.ts 참고) - 채널/역할 변경이 필요한
// 액션(승인/정지/복구/퇴출/연장)은 이 guildId를 그대로 넘긴다.
function requireGuildId(): string {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new SellerError("이 서버의 디스코드 길드 ID가 설정되지 않았습니다.");
  return guildId;
}

export async function approveSellerAction(formData: FormData) {
  const admin = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  try {
    await approveSeller(sellerId, admin.id, requireGuildId());
    await logAdminActivity(admin.id, "SELLER_APPROVE", sellerId);
  } catch (e) {
    if (!(e instanceof SellerError)) throw e;
  }
  revalidatePath("/admin/sellers");
}

export async function rejectSellerAction(formData: FormData) {
  const admin = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  const note = String(formData.get("note") || "").trim() || undefined;
  try {
    await rejectSeller(sellerId, admin.id, note);
    await logAdminActivity(admin.id, "SELLER_REJECT", sellerId);
  } catch (e) {
    if (!(e instanceof SellerError)) throw e;
  }
  revalidatePath("/admin/sellers");
}

export async function suspendSellerAction(formData: FormData) {
  const admin = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  const note = String(formData.get("note") || "").trim() || undefined;
  try {
    await suspendSeller(sellerId, admin.id, requireGuildId(), note);
    await logAdminActivity(admin.id, "SELLER_SUSPEND", sellerId);
  } catch (e) {
    if (!(e instanceof SellerError)) throw e;
  }
  revalidatePath("/admin/sellers");
}

export async function restoreSellerAction(formData: FormData) {
  const admin = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  try {
    await restoreSeller(sellerId, admin.id, requireGuildId());
    await logAdminActivity(admin.id, "SELLER_RESTORE", sellerId);
  } catch (e) {
    if (!(e instanceof SellerError)) throw e;
  }
  revalidatePath("/admin/sellers");
}

export async function expelSellerAction(formData: FormData) {
  const admin = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  const note = String(formData.get("note") || "").trim() || undefined;
  try {
    await expelSeller(sellerId, admin.id, requireGuildId(), note);
    await logAdminActivity(admin.id, "SELLER_EXPEL", sellerId);
  } catch (e) {
    if (!(e instanceof SellerError)) throw e;
  }
  revalidatePath("/admin/sellers");
}

export async function extendSellerAction(formData: FormData) {
  const admin = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  const days = Math.max(1, Number(formData.get("days") || 30) || 30);
  try {
    await extendSeller(sellerId, admin.id, requireGuildId(), days);
    await logAdminActivity(admin.id, "SELLER_EXTEND", sellerId, `${days}일`);
  } catch (e) {
    if (!(e instanceof SellerError)) throw e;
  }
  revalidatePath("/admin/sellers");
}
