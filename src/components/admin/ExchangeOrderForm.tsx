"use client";

import { useActionState } from "react";
import { exchangeOrderAction, type ActionState } from "@/lib/actions/adminOrders";

export function ExchangeOrderForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(exchangeOrderAction, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("다른 계정으로 교환(재추첨)할까요? 기존에 지급된 계정은 무효 처리됩니다.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className="border border-amber-300 text-amber-600 px-4 py-2 rounded-md text-sm hover:bg-amber-50 disabled:opacity-50"
      >
        {pending ? "교환 중..." : "교환(재추첨)"}
      </button>
      {state?.error && <p className="text-sm text-red-600 mt-1">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600 mt-1">{state.success}</p>}
    </form>
  );
}
