"use client";

import { useActionState } from "react";
import type { Tier } from "@prisma/client";
import { createTierAction, updateTierAction, type ActionState } from "@/lib/actions/adminProducts";

export function TierForm({ tier }: { tier?: Tier }) {
  const action = tier ? updateTierAction : createTierAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-3 max-w-lg">
      {tier && <input type="hidden" name="id" value={tier.id} />}
      <div>
        <label className="block text-xs text-neutral-500 mb-1">등급명</label>
        <input
          name="name"
          defaultValue={tier?.name}
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">가격(원)</label>
          <input
            name="price"
            type="number"
            defaultValue={tier?.price}
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">1인당 구매 제한 (비우면 무제한)</label>
          <input
            name="purchaseLimitPerUser"
            type="number"
            defaultValue={tier?.purchaseLimitPerUser ?? undefined}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">최소 그림 수</label>
          <input
            name="minCount"
            type="number"
            defaultValue={tier?.minCount}
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">최대 그림 수</label>
          <input
            name="maxCount"
            type="number"
            defaultValue={tier?.maxCount}
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      {tier && (
        <div>
          <label className="block text-xs text-neutral-500 mb-1">판매 상태</label>
          <select name="status" defaultValue={tier.status} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="ON_SALE">판매중</option>
            <option value="HIDDEN">숨김</option>
            <option value="SOLD_OUT">품절 처리</option>
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs text-neutral-500 mb-1">상품 설명</label>
        <textarea
          name="description"
          defaultValue={tier?.description ?? undefined}
          rows={3}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}
