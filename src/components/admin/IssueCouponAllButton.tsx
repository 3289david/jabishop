"use client";

import { issueCouponToAllAction } from "@/lib/actions/adminCoupons";

export function IssueCouponAllButton({ couponId }: { couponId: string }) {
  return (
    <form
      action={issueCouponToAllAction}
      onSubmit={(e) => {
        if (!confirm("모든 활성 회원에게 이 쿠폰을 지급할까요?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="couponId" value={couponId} />
      <button className="text-xs border border-neutral-300 px-2 py-1 rounded hover:bg-neutral-50">전체 지급</button>
    </form>
  );
}
