"use client";

import { useActionState } from "react";
import type { Inquiry } from "@prisma/client";
import { answerInquiryAction, type ActionState } from "@/lib/actions/adminInquiries";

export function AnswerInquiryForm({ inquiry }: { inquiry: Inquiry }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(answerInquiryAction, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={inquiry.id} />
      <textarea
        name="answer"
        defaultValue={inquiry.answer ?? undefined}
        placeholder="답변을 입력해주세요."
        required
        rows={5}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      <select name="status" defaultValue={inquiry.status === "WAITING" ? "ANSWERED" : inquiry.status} className="border rounded-md px-2 py-1.5 text-sm">
        <option value="PROCESSING">처리중</option>
        <option value="ANSWERED">답변완료</option>
        <option value="CLOSED">종료</option>
      </select>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "저장 중..." : "답변 등록"}
        </button>
      </div>
    </form>
  );
}
