"use client";

import { useActionState } from "react";
import { purchaseShopSubscriptionAction, type ActionState } from "@/lib/actions/shop";

export function ShopSubscriptionPurchaseForm({ tierId, price }: { tierId: string; price: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(purchaseShopSubscriptionAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tierId" value={tierId} />
      <div>
        <label className="block text-xs text-neutral-500 mb-1">원하는 웹사이트 주소</label>
        <div className="flex items-center border rounded-md overflow-hidden text-sm">
          <input
            type="text"
            name="shopSlug"
            placeholder="비워두면 자동으로 정해짐"
            pattern="[a-z0-9-]{3,30}"
            className="flex-1 px-3 py-2 outline-none min-w-0"
          />
          <span className="px-3 py-2 bg-neutral-50 text-neutral-400 whitespace-nowrap">.krl.kr</span>
        </div>
        <p className="text-[11px] text-neutral-400 mt-1">영문 소문자/숫자/하이픈 3~30자. 나중에 /샵주소변경으로도 바꿀 수 있어요.</p>
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">원하는 샵 이름</label>
        <input
          type="text"
          name="shopName"
          placeholder="비워두면 자동으로 정해짐"
          maxLength={40}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-indigo-600 text-white py-2.5 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "구매 처리 중..." : `${price.toLocaleString()}P로 바로 구매`}
      </button>
    </form>
  );
}
