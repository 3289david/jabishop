"use client";

import { useActionState } from "react";
import { createInquiryAction, type ActionState } from "@/lib/actions/inquiries";

export default function NewInquiryPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createInquiryAction, undefined);

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 max-w-xl">
      <h1 className="font-semibold mb-3">1:1 문의하기</h1>
      <form action={formAction} className="space-y-3">
        <input
          name="title"
          placeholder="제목"
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
        <textarea
          name="content"
          placeholder="문의 내용을 입력해주세요."
          required
          rows={6}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
        <div>
          <label className="block text-xs text-neutral-500 mb-1">이미지 첨부 (선택)</label>
          <input name="image" type="file" accept="image/*" className="text-sm" />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "등록 중..." : "문의 등록"}
        </button>
      </form>
    </div>
  );
}
