"use client";

import { useActionState, useState } from "react";
import { checkoutCartAction, type ActionState } from "@/lib/actions/shop";

export function CheckoutButton({
  disabled,
  coupons,
}: {
  disabled?: boolean;
  coupons: { code: string; name: string; discount: number }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(checkoutCartAction, undefined);
  const [couponCode, setCouponCode] = useState("");

  return (
    <div className="text-right">
      {coupons.length > 0 && (
        <select
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm mb-2 w-full"
        >
          <option value="">쿠폰 사용 안 함</option>
          {coupons.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} (-{c.discount.toLocaleString()}P, 담긴 상품 중 하나에 적용)
            </option>
          ))}
        </select>
      )}
      {state?.error && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <form action={formAction}>
        <input type="hidden" name="couponCode" value={couponCode} />
        <button
          type="submit"
          disabled={pending || disabled}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "처리 중..." : disabled ? "포인트 부족" : "포인트로 결제하기"}
        </button>
      </form>
    </div>
  );
}
