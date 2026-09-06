"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";

export type ActionState = { error?: string } | undefined;

export async function createCouponAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const name = String(formData.get("name") || "").trim();
  const discountType = String(formData.get("discountType") || "AMOUNT");
  const discountValue = Number(formData.get("discountValue") || 0);
  const minOrderAmount = Number(formData.get("minOrderAmount") || 0);
  const maxDiscountAmount = formData.get("maxDiscountAmount") ? Number(formData.get("maxDiscountAmount")) : null;
  const validFrom = new Date(String(formData.get("validFrom") || ""));
  const validTo = new Date(String(formData.get("validTo") || ""));
  const usageLimitTotal = formData.get("usageLimitTotal") ? Number(formData.get("usageLimitTotal")) : null;
  const usageLimitPerUser = Number(formData.get("usageLimitPerUser") || 1);

  if (!code || !name || discountValue <= 0 || isNaN(validFrom.getTime()) || isNaN(validTo.getTime())) {
    return { error: "입력값을 확인해주세요." };
  }
  const exists = await prisma.coupon.findUnique({ where: { code } });
  if (exists) return { error: "이미 존재하는 쿠폰 코드입니다." };

  const coupon = await prisma.coupon.create({
    data: {
      code,
      name,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      validFrom,
      validTo,
      usageLimitTotal,
      usageLimitPerUser,
    },
  });
  await logAdminActivity(admin.id, "COUPON_CREATE", coupon.id, code);
  revalidatePath("/admin/coupons");
  redirect("/admin/coupons");
}

export async function toggleCouponActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return;
  await prisma.coupon.update({ where: { id }, data: { active: !coupon.active } });
  await logAdminActivity(admin.id, "COUPON_TOGGLE", id, String(!coupon.active));
  revalidatePath("/admin/coupons");
}

export async function issueCouponToUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const couponId = String(formData.get("couponId") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { error: "존재하지 않는 회원 이메일입니다." };

  await prisma.userCoupon.upsert({
    where: { userId_couponId: { userId: user.id, couponId } },
    update: {},
    create: { userId: user.id, couponId },
  });
  await prisma.notification.create({
    data: { userId: user.id, type: "COUPON_ISSUED", title: "쿠폰 지급", message: "새로운 쿠폰이 지급되었습니다." },
  });
  await logAdminActivity(admin.id, "COUPON_ISSUE", couponId, email);
  revalidatePath("/admin/coupons");
  return { error: undefined };
}
