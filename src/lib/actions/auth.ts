"use server";

import { redirect } from "next/navigation";
import { destroyUserSession, getCurrentUser } from "@/lib/session";

export async function logoutAction() {
  await destroyUserSession();
  redirect("/");
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
