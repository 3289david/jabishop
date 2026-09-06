"use client";

import { useActionState } from "react";
import { sendBroadcastAction, type ActionState } from "@/lib/actions/adminNotifications";

export function BroadcastForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(sendBroadcastAction, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input name="title" placeholder="공지 제목" required className="w-full border rounded-md px-3 py-2 text-sm" />
      <textarea
        name="message"
        placeholder="공지 내용"
        required
        rows={3}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "발송 중..." : "전체 발송"}
      </button>
    </form>
  );
}
