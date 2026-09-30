"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/actions/auth";
import { purchaseTier, purchaseTierBulk, OrderError } from "@/lib/orders";
import { computeDiscount } from "@/lib/coupon";

export type ActionState = { error?: string } | undefined;

export async function purchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const tierId = String(formData.get("tierId") || "");
  const couponCode = String(formData.get("couponCode") || "").trim() || undefined;
  const quantity = Math.min(50, Math.max(1, Math.trunc(Number(formData.get("quantity") || 1)) || 1));

  if (quantity === 1) {
    let order;
    try {
      order = await purchaseTier({ userId: user.id, tierId, couponCode });
    } catch (e) {
      if (e instanceof OrderError) return { error: e.message };
      throw e;
    }

    // 구매 직후 헤더의 포인트 잔액이 stale해지지 않도록 루트 레이아웃까지 갱신한다.
    revalidatePath("/", "layout");
    redirect(`/mypage/orders/${order.id}`);
  }

  const result = await purchaseTierBulk({ userId: user.id, tierId, quantity, couponCode });
  if (result.successCount === 0) {
    return { error: result.lastError ?? "구매 중 오류가 발생했습니다." };
  }

  revalidatePath("/", "layout");
  if (result.failedCount > 0) {
    return {
      error: `${result.successCount}개 구매 완료 (총 ${result.totalPaid.toLocaleString()}P) 후 중단됨 - ${result.lastError}`,
    };
  }
  redirect("/mypage/orders");
}

export async function addToCartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const tierId = String(formData.get("tierId") || "");
  const quantity = Math.max(1, Number(formData.get("quantity") || 1));

  const tier = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!tier) return { error: "존재하지 않는 상품입니다." };

  await prisma.cartItem.upsert({
    where: { userId_tierId: { userId: user.id, tierId } },
    update: { quantity: { increment: quantity } },
    create: { userId: user.id, tierId, quantity },
  });
  revalidatePath("/cart");
  redirect("/cart");
}

export async function updateCartQtyAction(formData: FormData) {
  const user = await requireUser();
  const itemId = String(formData.get("itemId") || "");
  const quantity = Math.max(1, Number(formData.get("quantity") || 1));
  await prisma.cartItem.updateMany({ where: { id: itemId, userId: user.id }, data: { quantity } });
  revalidatePath("/cart");
}

export async function removeFromCartAction(formData: FormData) {
  const user = await requireUser();
  const itemId = String(formData.get("itemId") || "");
  await prisma.cartItem.deleteMany({ where: { id: itemId, userId: user.id } });
  revalidatePath("/cart");
}

export async function checkoutCartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const couponCode = String(formData.get("couponCode") || "").trim() || undefined;
  const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
  if (items.length === 0) return { error: "장바구니가 비어 있습니다." };

  // 쿠폰은 장바구니 안의 여러 등급 중 실제로 적용 가능한 첫 항목에만 쓴다 - 맞지 않는
  // 항목에 잘못 시도하면 그 항목 전체가 쿠폰 오류로 실패 처리돼버리기 때문이다.
  let couponTargetTierId: string | null = null;
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
    if (coupon) {
      for (const item of items) {
        try {
          computeDiscount(coupon, item.tier.price, item.tierId);
          couponTargetTierId = item.tierId;
          break;
        } catch {
          continue;
        }
      }
    }
  }

  let successCount = 0;
  let couponConsumed = false;
  const errors: string[] = [];

  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      const useCouponHere = !couponConsumed && couponCode !== undefined && item.tierId === couponTargetTierId;
      try {
        await purchaseTier({ userId: user.id, tierId: item.tierId, couponCode: useCouponHere ? couponCode : undefined });
        if (useCouponHere) couponConsumed = true;
        successCount++;
        // 성공한 수량만큼 장바구니 수량을 줄여, 실패 시점까지의 진행 상황을 정확히 반영한다.
        await prisma.cartItem.update({
          where: { id: item.id },
          data: { quantity: { decrement: 1 } },
        }).catch(() => {});
      } catch (e) {
        errors.push(`${item.tier.name}: ${e instanceof OrderError ? e.message : "구매 중 오류가 발생했습니다."}`);
        break;
      }
    }
  }

  await prisma.cartItem.deleteMany({ where: { userId: user.id, quantity: { lte: 0 } } });

  if (errors.length > 0) {
    if (successCount > 0) revalidatePath("/", "layout");
    return {
      error:
        successCount > 0
          ? `${successCount}건 주문 완료. 실패: ${errors.join(" / ")}`
          : errors.join(" / "),
    };
  }

  revalidatePath("/", "layout");
  redirect("/mypage/orders");
}
