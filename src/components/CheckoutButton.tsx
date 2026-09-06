"use client";

import { useActionState } from "react";
import { checkoutCartAction, type ActionState } from "@/lib/actions/shop";

export function CheckoutButton({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(checkoutCartAction, undefined);

  return (
    <div className="text-right">
      {state?.error && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <form action={formAction}>
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
