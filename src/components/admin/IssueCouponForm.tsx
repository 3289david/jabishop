"use client";

import { useActionState } from "react";
import { issueCouponToUserAction, type ActionState } from "@/lib/actions/adminCoupons";

export function IssueCouponForm({ couponId }: { couponId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(issueCouponToUserAction, undefined);

  return (
    <form action={formAction} className="flex gap-1">
      <input type="hidden" name="couponId" value={couponId} />
      <input
        name="email"
        placeholder="회원 이메일"
        required
        className="border rounded-md px-2 py-1 text-xs w-32"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-xs bg-neutral-900 text-white px-2 py-1 rounded hover:bg-neutral-700 disabled:opacity-50"
      >
        지급
      </button>
      {state?.error && <span className="text-xs text-red-500 ml-1">{state.error}</span>}
    </form>
  );
}
