"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { getClientInfo } from "@/lib/session";
import { requireAdmin, requireSuperAdmin } from "@/lib/actions/adminAuth";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

export async function logAdminActivity(
  adminId: string,
  action: string,
  target?: string,
  detail?: string
) {
  const { ip } = await getClientInfo().catch(() => ({ ip: undefined }));
  await prisma.adminActivityLog.create({
    data: { adminId, action, target, detail, ip },
  });
}

export type ActionState = { error?: string; success?: string } | undefined;

export async function createAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSuperAdmin();
  const loginId = String(formData.get("loginId") || "").trim();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "STAFF");

  if (!loginId || password.length < 8 || !name) {
    return { error: "아이디, 이름을 입력하고 비밀번호는 8자 이상으로 설정해주세요." };
  }
  const existing = await prisma.adminUser.findUnique({ where: { loginId } });
  if (existing) return { error: "이미 존재하는 관리자 아이디입니다." };

  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.create({
    data: { loginId, passwordHash, name, role },
  });
  await logAdminActivity(me.id, "ADMIN_CREATE", admin.id, `관리자 계정 생성: ${loginId} (${role})`);
  revalidatePath("/admin/security/admins");
  return { success: "관리자 계정이 생성되었습니다." };
}

export async function updateAdminRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSuperAdmin();
  const adminId = String(formData.get("adminId") || "");
  const role = String(formData.get("role") || "STAFF");
  const status = String(formData.get("status") || "ACTIVE");

  await prisma.adminUser.update({ where: { id: adminId }, data: { role, status } });
  await logAdminActivity(me.id, "ADMIN_UPDATE", adminId, `권한: ${role}, 상태: ${status}`);
  revalidatePath("/admin/security/admins");
  return { success: "수정되었습니다." };
}

export async function setupTotpAction() {
  const admin = await requireAdmin();
  const secret = generateTotpSecret();
  await prisma.adminUser.update({ where: { id: admin.id }, data: { totpSecret: secret, totpEnabled: false } });
  const uri = totpUri(secret, admin.loginId);
  const qrDataUrl = await QRCode.toDataURL(uri);
  return { secret, qrDataUrl };
}

export async function enableTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const token = String(formData.get("totpToken") || "").trim();
  const fresh = await prisma.adminUser.findUnique({ where: { id: admin.id } });
  if (!fresh?.totpSecret) return { error: "먼저 QR 코드를 생성해주세요." };

  const ok = verifyTotp(fresh.totpSecret, token);
  if (!ok) return { error: "인증 코드가 올바르지 않습니다." };

  await prisma.adminUser.update({ where: { id: admin.id }, data: { totpEnabled: true } });
  await logAdminActivity(admin.id, "2FA_ENABLED");
  revalidatePath("/admin/security/2fa");
  return { success: "2단계 인증이 활성화되었습니다." };
}

export async function disableTotpAction(): Promise<void> {
  const admin = await requireAdmin();
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { totpEnabled: false, totpSecret: null },
  });
  await logAdminActivity(admin.id, "2FA_DISABLED");
  revalidatePath("/admin/security/2fa");
}
