"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createUserSession, destroyUserSession, getCurrentUser } from "@/lib/session";
import { USER_STATUS } from "@/lib/constants";

export type ActionState = { error?: string } | undefined;

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("passwordConfirm") || "");
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (!email || !email.includes("@")) return { error: "올바른 이메일을 입력해주세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (password !== passwordConfirm) return { error: "비밀번호가 일치하지 않습니다." };
  if (!name) return { error: "이름을 입력해주세요." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "이미 가입된 이메일입니다." };

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, phone: phone || null },
  });

  await createUserSession(user.id);
  redirect("/mypage");
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };

  if (user.status === USER_STATUS.SUSPENDED) return { error: "이용이 정지된 계정입니다." };
  if (user.status === USER_STATUS.WITHDRAWN) return { error: "탈퇴한 계정입니다." };

  await createUserSession(user.id);
  redirect("/mypage");
}

export async function logoutAction() {
  await destroyUserSession();
  redirect("/");
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
