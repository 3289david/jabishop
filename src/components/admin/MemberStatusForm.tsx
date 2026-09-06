"use client";

import { useActionState } from "react";
import type { User } from "@prisma/client";
import { updateMemberStatusAction, type ActionState } from "@/lib/actions/adminMembers";

export function MemberStatusForm({ user }: { user: User }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateMemberStatusAction, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={user.id} />
      <select name="status" defaultValue={user.status} className="w-full border rounded-md px-3 py-2 text-sm">
        <option value="ACTIVE">정상</option>
        <option value="SUSPENDED">이용정지</option>
        <option value="WITHDRAWN">탈퇴</option>
      </select>
      <textarea
        name="suspendedReason"
        placeholder="정지 사유 (선택)"
        defaultValue={user.suspendedReason ?? undefined}
        rows={2}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      <textarea
        name="adminMemo"
        placeholder="관리자 메모"
        defaultValue={user.adminMemo ?? undefined}
        rows={2}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-neutral-900 text-white px-4 py-2 rounded-md text-sm hover:bg-neutral-700 disabled:opacity-50"
      >
        저장
      </button>
    </form>
  );
}
