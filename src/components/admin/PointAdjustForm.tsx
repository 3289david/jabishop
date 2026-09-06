"use client";

import { useActionState } from "react";
import { adminAdjustPointsAction, type ActionState } from "@/lib/actions/adminMembers";

export function PointAdjustForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adminAdjustPointsAction, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid grid-cols-2 gap-2">
        <input
          name="amount"
          type="number"
          placeholder="증감 포인트 (음수 가능)"
          required
          className="border rounded-md px-3 py-2 text-sm"
        />
        <input name="memo" placeholder="사유" required className="border rounded-md px-3 py-2 text-sm" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-neutral-900 text-white px-4 py-2 rounded-md text-sm hover:bg-neutral-700 disabled:opacity-50"
      >
        포인트 조정
      </button>
    </form>
  );
}
