"use client";

import { useActionState } from "react";
import { purgeSeedDataAction, type ActionState } from "@/lib/actions/adminSettings";

export function PurgeSeedDataForm({ userCount, artworkCount }: { userCount: number; artworkCount: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(purgeSeedDataAction, undefined);

  if (userCount === 0 && artworkCount === 0) {
    return <p className="text-sm text-neutral-400">삭제할 데모 데이터가 없습니다.</p>;
  }

  return (
    <form action={formAction} className="space-y-2 max-w-md">
      <p className="text-sm text-neutral-500">
        시드 스크립트가 만든 테스트 회원 {userCount}명, 데모 계정 재고 {artworkCount}개가 남아있습니다. 실제
        서비스를 시작하기 전에 정리하세요. 실제 관리자 계정과 관리자가 직접 등록한 재고는 영향받지 않습니다.
      </p>
      <label className="block text-xs text-neutral-500">
        계속하려면 아래 칸에 <span className="font-semibold text-red-600">삭제</span>를 입력하세요.
      </label>
      <input name="confirm" required className="w-full border rounded-md px-3 py-2 text-sm" />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="border border-red-300 text-red-600 px-4 py-2 rounded-md text-sm font-medium hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "삭제 중..." : "데모 데이터 영구 삭제"}
      </button>
    </form>
  );
}
