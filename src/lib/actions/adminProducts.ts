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
  const description = String(formData.get("description") || "").trim() || null;
  const purchaseLimitPerUser = formData.get("purchaseLimitPerUser")
    ? Number(formData.get("purchaseLimitPerUser"))
    : null;
  const category = String(formData.get("category") || "").trim() || null;
  const costPrice = formData.get("costPrice") ? Number(formData.get("costPrice")) : null;

  if (!name || price <= 0) {
    return { error: "입력값을 확인해주세요 (이름 / 가격)." };
  }

  let slug = slugify(name);
  if (!slug) slug = `tier-${Date.now()}`;
  const exists = await prisma.tier.findUnique({ where: { slug } });
  if (exists) slug = `${slug}-${Date.now().toString().slice(-5)}`;

  const tier = await prisma.tier.create({
    data: { slug, name, price, description, purchaseLimitPerUser, category, costPrice },
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
  const description = String(formData.get("description") || "").trim() || null;
  const status = String(formData.get("status") || "ON_SALE");
  const purchaseLimitPerUser = formData.get("purchaseLimitPerUser")
    ? Number(formData.get("purchaseLimitPerUser"))
    : null;
  const category = String(formData.get("category") || "").trim() || null;
  const costPrice = formData.get("costPrice") ? Number(formData.get("costPrice")) : null;

  if (!name || price <= 0) {
    return { error: "입력값을 확인해주세요 (이름 / 가격)." };
  }

  await prisma.tier.update({
    where: { id },
    data: { name, price, description, status, purchaseLimitPerUser, category, costPrice },
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

const DUPLICATE_PREFIX = "한섭 ";

// 현재 모든 등급을 "한섭 " 접두사로 복제한다. 실제 계정 재고는 1개 1개가 고유한 값이라
// 그대로 복제할 수 없으므로, 등급(가격/설명 등) 정의만 복제하고 재고는 0으로 시작한다
// (관리자가 /admin/inventory에서 별도로 채워야 함). 이미 복제된 등급은 다시 복제하지 않는다.
export async function duplicateAllTiersAction() {
  const admin = await requireAdmin();
  const tiers = await prisma.tier.findMany({ orderBy: { sortOrder: "asc" } });

  let created = 0;
  for (const t of tiers) {
    if (t.name.startsWith(DUPLICATE_PREFIX)) continue;

    const slug = `hanseob-${t.slug}`;
    if (await prisma.tier.findUnique({ where: { slug } })) continue;

    await prisma.tier.create({
      data: {
        slug,
        name: `${DUPLICATE_PREFIX}${t.name}`,
        price: t.price,
        description: t.description,
        purchaseLimitPerUser: t.purchaseLimitPerUser,
        category: t.category,
        status: "HIDDEN",
        sortOrder: t.sortOrder,
      },
    });
    created++;
  }

  await logAdminActivity(admin.id, "TIER_DUPLICATE_ALL", undefined, `${created}건 복제`);
  revalidatePath("/admin/products");
}

const DISCOUNT_MODE_MIN_PRICE = 100;
const DISCOUNT_MODE_MAX_PRICE = 4000;
const DISCOUNT_MODE_ROUND_TO = 50;

/**
 * "할인 모드" - 켜면 "한섭 " 등급들의 가격을, 서로간의 상대적인 비율(싼 건 더 싸게/비싼 건
 * 더 비싸게)은 유지한 채로 100원~4000원 범위 안에 맞게 비례 축소한다. 등급이 하나뿐이면
 * 그냥 최저가로 맞춘다. 끄기 전 가격은 Tier.originalPrice에 보관해뒀다가, 끄면 그 값으로
 * 되돌린다.
 */
export async function setDiscountModeAction(formData: FormData) {
  const admin = await requireAdmin();
  const enabled = String(formData.get("enabled") || "") === "true";

  const tiers = await prisma.tier.findMany();
  let affected = 0;

  if (enabled) {
    const targets = tiers.filter((t) => t.name.startsWith(DUPLICATE_PREFIX) && t.originalPrice == null);
    if (targets.length > 0) {
      const prices = targets.map((t) => t.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const range = max - min;

      for (const t of targets) {
        const ratio = range === 0 ? 0 : (t.price - min) / range;
        const raw = DISCOUNT_MODE_MIN_PRICE + ratio * (DISCOUNT_MODE_MAX_PRICE - DISCOUNT_MODE_MIN_PRICE);
        const discountedPrice = Math.round(raw / DISCOUNT_MODE_ROUND_TO) * DISCOUNT_MODE_ROUND_TO;
        await prisma.tier.update({ where: { id: t.id }, data: { originalPrice: t.price, price: discountedPrice } });
        affected++;
      }
    }
  } else {
    for (const t of tiers) {
      if (t.originalPrice == null) continue;
      await prisma.tier.update({ where: { id: t.id }, data: { price: t.originalPrice, originalPrice: null } });
      affected++;
    }
  }

  await prisma.shopSetting.upsert({
    where: { id: "singleton" },
    update: { discountModeEnabled: enabled },
    create: { id: "singleton", bankName: "", bankAccountNumber: "", bankAccountHolder: "", discountModeEnabled: enabled },
  });

  await logAdminActivity(admin.id, "DISCOUNT_MODE_TOGGLE", undefined, `${enabled ? "ON" : "OFF"} (${affected}건)`);
  revalidatePath("/admin/products");
}
