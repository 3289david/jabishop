"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";

export type ActionState = { error?: string } | undefined;

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createTierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const price = Number(formData.get("price") || 0);
  const minCount = Number(formData.get("minCount") || 0);
  const maxCount = Number(formData.get("maxCount") || 0);
  const description = String(formData.get("description") || "").trim() || null;
  const purchaseLimitPerUser = formData.get("purchaseLimitPerUser")
    ? Number(formData.get("purchaseLimitPerUser"))
    : null;

  if (!name || price <= 0 || minCount <= 0 || maxCount < minCount) {
    return { error: "입력값을 확인해주세요 (이름 / 가격 / 최소·최대 그림 수)." };
  }

  let slug = slugify(name);
  if (!slug) slug = `tier-${Date.now()}`;
  const exists = await prisma.tier.findUnique({ where: { slug } });
  if (exists) slug = `${slug}-${Date.now().toString().slice(-5)}`;

  const tier = await prisma.tier.create({
    data: { slug, name, price, minCount, maxCount, description, purchaseLimitPerUser },
  });
  await logAdminActivity(admin.id, "TIER_CREATE", tier.id, name);
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateTierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const price = Number(formData.get("price") || 0);
  const minCount = Number(formData.get("minCount") || 0);
  const maxCount = Number(formData.get("maxCount") || 0);
  const description = String(formData.get("description") || "").trim() || null;
  const status = String(formData.get("status") || "ON_SALE");
  const purchaseLimitPerUser = formData.get("purchaseLimitPerUser")
    ? Number(formData.get("purchaseLimitPerUser"))
    : null;

  if (!name || price <= 0 || minCount <= 0 || maxCount < minCount) {
    return { error: "입력값을 확인해주세요 (이름 / 가격 / 최소·최대 그림 수)." };
  }

  await prisma.tier.update({
    where: { id },
    data: { name, price, minCount, maxCount, description, status, purchaseLimitPerUser },
  });
  await logAdminActivity(admin.id, "TIER_UPDATE", id, `${name} / ${status}`);
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function deleteTierAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const artworkCount = await prisma.artwork.count({ where: { tierId: id } });
  if (artworkCount > 0) {
    // 재고가 남아있는 등급은 실수로 삭제되지 않도록 숨김 처리로 대체한다.
    await prisma.tier.update({ where: { id }, data: { status: "HIDDEN" } });
    await logAdminActivity(admin.id, "TIER_HIDE", id, "재고가 있어 숨김 처리");
  } else {
    await prisma.tier.delete({ where: { id } });
    await logAdminActivity(admin.id, "TIER_DELETE", id);
  }
  revalidatePath("/admin/products");
}
