"use client";

import { useActionState } from "react";
import { createAdminAction, type ActionState } from "@/lib/actions/adminSecurity";

export function CreateAdminForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAdminAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-2 items-end">
      <div>
        <label className="block text-xs text-neutral-500 mb-1">관리자 ID</label>
        <input name="loginId" required className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">이름</label>
        <input name="name" required className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">초기 비밀번호</label>
        <input name="password" type="password" required minLength={8} className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">권한</label>
        <select name="role" className="w-full border rounded-md px-3 py-2 text-sm">
          <option value="STAFF">STAFF</option>
          <option value="MANAGER">MANAGER</option>
          <option value="SUPER">SUPER</option>
        </select>
      </div>
      <div className="col-span-2">
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "생성 중..." : "관리자 생성"}
        </button>
      </div>
    </form>
  );
}
