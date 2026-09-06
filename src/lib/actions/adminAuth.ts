"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createAdminSession, destroyAdminSession, getCurrentAdmin, getClientInfo } from "@/lib/session";
import { verifyTotp } from "@/lib/totp";
import { ADMIN_STATUS } from "@/lib/constants";
import { logAdminActivity } from "@/lib/actions/adminSecurity";

export type ActionState = { error?: string; step?: "totp" } | undefined;

const PENDING_COOKIE = "jbs_admin_pending";

function pendingSecret() {
  return new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET!);
}

export async function adminLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const loginId = String(formData.get("loginId") || "").trim();
  const password = String(formData.get("password") || "");
  const totpToken = String(formData.get("totpToken") || "").trim();
  const pendingToken = String(formData.get("pendingToken") || "");

  const { ip, userAgent } = await getClientInfo();

  // 2단계: TOTP 코드 검증 단계
  if (pendingToken) {
    try {
      const { payload } = await jwtVerify(pendingToken, pendingSecret());
      const adminId = payload.sub as string;
      const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
      if (!admin || !admin.totpSecret) return { error: "인증 세션이 만료되었습니다. 다시 로그인해주세요." };

      const ok = verifyTotp(admin.totpSecret, totpToken);
      if (!ok) {
        await prisma.adminLoginLog.create({
          data: { adminId: admin.id, loginId: admin.loginId, ip, userAgent, success: false, reason: "2FA 코드 불일치" },
        });
        return { error: "인증 코드가 올바르지 않습니다.", step: "totp" };
      }

      await prisma.adminLoginLog.create({
        data: { adminId: admin.id, loginId: admin.loginId, ip, userAgent, success: true },
      });
      await createAdminSession(admin.id);
      await logAdminActivity(admin.id, "LOGIN", undefined, "2FA 로그인 성공");
    } catch {
      return { error: "인증 세션이 만료되었습니다. 다시 로그인해주세요." };
    }
    redirect("/admin");
  }

  // 1단계: 아이디/비밀번호 검증
  const admin = await prisma.adminUser.findUnique({ where: { loginId } });
  if (!admin) {
    await prisma.adminLoginLog.create({
      data: { loginId, ip, userAgent, success: false, reason: "존재하지 않는 관리자" },
    });
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }
  if (admin.status === ADMIN_STATUS.DISABLED) {
    return { error: "비활성화된 관리자 계정입니다." };
  }

  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    await prisma.adminLoginLog.create({
      data: { adminId: admin.id, loginId, ip, userAgent, success: false, reason: "비밀번호 불일치" },
    });
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  if (admin.totpEnabled && admin.totpSecret) {
    const token = await new SignJWT({ sub: admin.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(pendingSecret());
    const c = await cookies();
    c.set(PENDING_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/admin/login", maxAge: 300 });
    return { step: "totp" };
  }

  await prisma.adminLoginLog.create({
    data: { adminId: admin.id, loginId, ip, userAgent, success: true },
  });
  await createAdminSession(admin.id);
  await logAdminActivity(admin.id, "LOGIN", undefined, "로그인 성공");
  redirect("/admin");
}

export async function adminLoginTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const totpToken = String(formData.get("totpToken") || "").trim();
  const c = await cookies();
  const pendingToken = c.get(PENDING_COOKIE)?.value;
  if (!pendingToken) return { error: "인증 세션이 만료되었습니다. 다시 로그인해주세요." };

  const fd = new FormData();
  fd.set("pendingToken", pendingToken);
  fd.set("totpToken", totpToken);
  const result = await adminLoginAction(undefined, fd);
  if (!result?.error) c.delete(PENDING_COOKIE);
  return result;
}

export async function adminLogoutAction() {
  const admin = await getCurrentAdmin();
  if (admin) await logAdminActivity(admin.id, "LOGOUT");
  await destroyAdminSession();
  redirect("/admin/login");
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireSuperAdmin() {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER") redirect("/admin");
  return admin;
}
