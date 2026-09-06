"use client";

import { useActionState, useState } from "react";
import { purchaseAction, addToCartAction, type ActionState } from "@/lib/actions/shop";

export function PurchaseForm({ tierId, price }: { tierId: string; price: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(purchaseAction, undefined);
  const [cartState, cartAction, cartPending] = useActionState<ActionState, FormData>(addToCartAction, undefined);
  const [couponCode, setCouponCode] = useState("");

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="tierId" value={tierId} />
        <label className="block text-xs text-neutral-500">쿠폰 코드 (선택)</label>
        <input
          name="couponCode"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          placeholder="쿠폰 코드 입력"
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "구매 처리 중..." : `${price.toLocaleString()}P로 바로 구매`}
        </button>
      </form>
      <form action={cartAction}>
        <input type="hidden" name="tierId" value={tierId} />
        <input type="hidden" name="quantity" value={1} />
        {cartState?.error && <p className="text-sm text-red-600 mb-1">{cartState.error}</p>}
        <button
          type="submit"
          disabled={cartPending}
          className="w-full border border-neutral-300 py-2.5 rounded-md text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
        >
          장바구니에 담기
        </button>
      </form>
    </div>
  );
}
