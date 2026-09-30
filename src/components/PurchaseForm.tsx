"use client";

import { useActionState, useState } from "react";
import { purchaseAction, addToCartAction, type ActionState } from "@/lib/actions/shop";

export function PurchaseForm({
  tierId,
  price,
  coupons,
}: {
  tierId: string;
  price: number;
  coupons: { code: string; name: string; discount: number }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(purchaseAction, undefined);
  const [cartState, cartAction, cartPending] = useActionState<ActionState, FormData>(addToCartAction, undefined);
  const [couponCode, setCouponCode] = useState("");
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-neutral-500 mb-1">수량</label>
        <input
          type="number"
          min={1}
          max={50}
          value={quantity}
          onChange={(e) => setQuantity(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="tierId" value={tierId} />
        <input type="hidden" name="quantity" value={quantity} />
        <label className="block text-xs text-neutral-500">쿠폰 (선택)</label>
        <select
          name="couponCode"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        >
          <option value="">쿠폰 사용 안 함</option>
          {coupons.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} (-{c.discount.toLocaleString()}P)
            </option>
          ))}
        </select>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "구매 처리 중..." : `${(price * quantity).toLocaleString()}P로 바로 구매`}
        </button>
      </form>
      <form action={cartAction}>
        <input type="hidden" name="tierId" value={tierId} />
        <input type="hidden" name="quantity" value={quantity} />
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
