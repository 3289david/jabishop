"use client";

import { useActionState } from "react";
import { requestExchangeAction, type ActionState } from "@/lib/actions/userExchanges";

export function ExchangeRequestForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestExchangeAction, undefined);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <textarea
        name="reason"
        placeholder="교환 사유를 입력해주세요."
        required
        rows={2}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      <div>
        <label className="block text-xs text-neutral-500 mb-1">증빙 파일 (스크린샷 등, 필수)</label>
        <input name="proof" type="file" required className="text-sm" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="border border-amber-300 text-amber-600 px-4 py-2 rounded-md text-sm hover:bg-amber-50 disabled:opacity-50"
      >
        {pending ? "신청 중..." : "교환 신청"}
      </button>
    </form>
  );
}
