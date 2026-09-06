"use client";

import { useActionState } from "react";
import { requestRefundAction, type ActionState } from "@/lib/actions/userRefunds";

export function RefundRequestForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestRefundAction, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <textarea
        name="reason"
        placeholder="환불 사유를 입력해주세요."
        required
        rows={2}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="border border-red-300 text-red-600 px-4 py-2 rounded-md text-sm hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "신청 중..." : "환불 신청"}
      </button>
    </form>
  );
}
