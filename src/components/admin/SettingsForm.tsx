"use client";

import { useActionState } from "react";
import type { ShopSetting } from "@prisma/client";
import { updateSettingsAction, type ActionState } from "@/lib/actions/adminSettings";

export function SettingsForm({ settings }: { settings: ShopSetting | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateSettingsAction, undefined);

  return (
    <form action={formAction} className="space-y-3 max-w-md">
      <div>
        <label className="block text-xs text-neutral-500 mb-1">쇼핑몰 이름</label>
        <input name="shopName" defaultValue={settings?.shopName ?? "자비샵"} className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">은행명</label>
          <input name="bankName" defaultValue={settings?.bankName} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">예금주</label>
          <input name="bankAccountHolder" defaultValue={settings?.bankAccountHolder} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">계좌번호</label>
        <input name="bankAccountNumber" defaultValue={settings?.bankAccountNumber} className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="refundAllowedAfterDownload" type="checkbox" defaultChecked={settings?.refundAllowedAfterDownload} />
        다운로드한 상품도 환불 허용
      </label>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">안내 문구</label>
        <textarea
          name="noticeMessage"
          defaultValue={settings?.noticeMessage ?? undefined}
          rows={2}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
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
