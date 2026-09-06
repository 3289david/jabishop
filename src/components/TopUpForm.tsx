"use client";

import { useActionState } from "react";
import { requestTopUpAction, type ActionState } from "@/lib/actions/userPoints";

export function TopUpForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestTopUpAction, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          name="amount"
          type="number"
          min={1000}
          step={100}
          placeholder="충전 금액"
          required
          className="border rounded-md px-3 py-2 text-sm"
        />
        <input
          name="depositorName"
          type="text"
          placeholder="입금자명"
          required
          className="border rounded-md px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "신청 중..." : "충전 신청"}
      </button>
    </form>
  );
}
