"use server";

import { redirect } from "next/navigation";
import { destroyAdminSession, getCurrentAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/actions/adminSecurity";

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
