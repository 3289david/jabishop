"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { createReportAction, type ActionState } from "@/lib/actions/reports";

export default function NewReportPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createReportAction, undefined);
  const params = useSearchParams();
  const targetType = params.get("targetType") || "OTHER";
  const targetId = params.get("targetId") || "";

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 max-w-xl">
      <h1 className="font-semibold mb-3">신고하기</h1>
      <form action={formAction} className="space-y-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">신고 유형</label>
          <select name="targetType" defaultValue={targetType} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="PRODUCT">상품</option>
            <option value="REVIEW">리뷰</option>
            <option value="USER">사용자</option>
            <option value="OTHER">기타</option>
          </select>
        </div>
        <input type="hidden" name="targetId" value={targetId} />
        <textarea
          name="reason"
          placeholder="신고 사유"
          required
          rows={2}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
        <textarea
          name="detail"
          placeholder="상세 내용 (선택)"
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
          {pending ? "접수 중..." : "신고 접수"}
        </button>
      </form>
    </div>
  );
}
