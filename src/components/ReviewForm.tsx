"use client";

import { useActionState, useState } from "react";
import { createReviewAction, type ActionState } from "@/lib/actions/reviews";

export function ReviewForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createReviewAction, undefined);
  const [rating, setRating] = useState(5);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={n <= rating ? "text-amber-500" : "text-neutral-300"}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        name="content"
        placeholder="구매한 그림에 대한 리뷰를 남겨주세요."
        required
        rows={3}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-neutral-900 text-white px-4 py-2 rounded-md text-sm hover:bg-neutral-700 disabled:opacity-50"
      >
        {pending ? "등록 중..." : "리뷰 등록"}
      </button>
    </form>
  );
}
