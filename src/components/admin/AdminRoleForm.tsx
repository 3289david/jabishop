"use client";

import { useActionState } from "react";
import type { AdminUser } from "@prisma/client";
import { updateAdminRoleAction, type ActionState } from "@/lib/actions/adminSecurity";

export function AdminRoleForm({ admin }: { admin: AdminUser }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateAdminRoleAction, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="adminId" value={admin.id} />
      <select name="role" defaultValue={admin.role} className="border rounded-md px-2 py-1 text-xs">
        <option value="STAFF">STAFF</option>
        <option value="MANAGER">MANAGER</option>
        <option value="SUPER">SUPER</option>
      </select>
      <select name="status" defaultValue={admin.status} className="border rounded-md px-2 py-1 text-xs">
        <option value="ACTIVE">활성</option>
        <option value="DISABLED">비활성</option>
      </select>
      <button disabled={pending} className="text-xs bg-neutral-900 text-white px-2 py-1 rounded hover:bg-neutral-700">
        저장
      </button>
      {state?.error && <span className="text-xs text-red-500">{state.error}</span>}
    </form>
  );
}
