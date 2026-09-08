"use client";

import { useActionState } from "react";
import type { Tier } from "@prisma/client";
import { grantArtworkAction, type ActionState } from "@/lib/actions/adminMembers";

export function GrantArtworkForm({ userId, tiers }: { userId: string; tiers: Tier[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(grantArtworkAction, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid grid-cols-2 gap-2">
        <select name="tierId" required className="border rounded-md px-3 py-2 text-sm">
          <option value="">등급 선택</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "지급 중..." : "계정 지급"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
    </form>
  );
}
