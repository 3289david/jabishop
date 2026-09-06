"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/actions/auth";
import { purchaseTier, OrderError } from "@/lib/orders";

export type ActionState = { error?: string } | undefined;

export async function purchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const tierId = String(formData.get("tierId") || "");
  const couponCode = String(formData.get("couponCode") || "").trim() || undefined;

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

export async function checkoutCartAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
  if (items.length === 0) return { error: "장바구니가 비어 있습니다." };

  let successCount = 0;
  let firstError: string | null = null;

  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      try {
        await purchaseTier({ userId: user.id, tierId: item.tierId });
        successCount++;
        // 성공한 수량만큼 장바구니 수량을 줄여, 실패 시점까지의 진행 상황을 정확히 반영한다.
        await prisma.cartItem.update({
          where: { id: item.id },
          data: { quantity: { decrement: 1 } },
        }).catch(() => {});
      } catch (e) {
        firstError = `${item.tier.name}: ${e instanceof OrderError ? e.message : "구매 중 오류가 발생했습니다."}`;
        break;
      }
    }
    if (firstError) break;
  }

  await prisma.cartItem.deleteMany({ where: { userId: user.id, quantity: { lte: 0 } } });

  if (firstError) {
    if (successCount > 0) revalidatePath("/", "layout");
    return {
      error:
        successCount > 0
          ? `${successCount}건 주문 완료 후 중단됨 - ${firstError}`
          : firstError,
    };
  }

  revalidatePath("/", "layout");
  redirect("/mypage/orders");
}
