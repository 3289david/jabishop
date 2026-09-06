"use client";

import { useActionState } from "react";
import { createCouponAction, type ActionState } from "@/lib/actions/adminCoupons";

export default function NewCouponPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCouponAction, undefined);

  return (
    <div className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">쿠폰 생성</h1>
      <form action={formAction} className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">쿠폰 코드</label>
            <input name="code" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">쿠폰 이름</label>
            <input name="name" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">할인 유형</label>
            <select name="discountType" className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="AMOUNT">정액 할인(원)</option>
              <option value="RATE">정률 할인(%)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">할인 값</label>
            <input name="discountValue" type="number" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">최소 주문금액</label>
            <input name="minOrderAmount" type="number" defaultValue={0} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">최대 할인금액 (정률용, 선택)</label>
            <input name="maxDiscountAmount" type="number" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">전체 사용 횟수 제한 (선택)</label>
            <input name="usageLimitTotal" type="number" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">1인당 사용 제한</label>
            <input name="usageLimitPerUser" type="number" defaultValue={1} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">유효기간 시작</label>
            <input name="validFrom" type="date" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">유효기간 종료</label>
            <input name="validTo" type="date" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "생성 중..." : "생성"}
        </button>
      </form>
    </div>
  );
}
