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

      <hr className="my-2" />
      <p className="text-xs font-semibold text-neutral-600">Discord 연동 - 채널/역할 ID</p>
      <p className="text-xs text-neutral-400 -mt-2">
        디스코드에서 개발자 모드를 켠 뒤 채널/역할을 우클릭 → ID 복사로 값을 가져오세요. 통계 채널 2개는
        비워두면 봇이 자동으로 생성합니다.
      </p>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">구매 로그 채널 ID (선택)</label>
        <input
          name="discordPurchaseLogChannelId"
          defaultValue={settings?.discordPurchaseLogChannelId ?? undefined}
          placeholder="비워두면 구매 로그를 게시하지 않음"
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">회원수 음성채널 ID (자동생성)</label>
          <input
            name="discordMemberCountChannelId"
            defaultValue={settings?.discordMemberCountChannelId ?? undefined}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">구매자수 음성채널 ID (자동생성)</label>
          <input
            name="discordBuyerCountChannelId"
            defaultValue={settings?.discordBuyerCountChannelId ?? undefined}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <p className="text-xs font-semibold text-neutral-600 mt-2">누적 구매금액 등급별 역할 ID</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">150,000원↑ (10% 할인) 역할 ID</label>
          <input name="discordRoleTier150k" defaultValue={settings?.discordRoleTier150k ?? undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">100,000원↑ (8% 할인) 역할 ID</label>
          <input name="discordRoleTier100k" defaultValue={settings?.discordRoleTier100k ?? undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">50,000원↑ (5% 할인) 역할 ID</label>
          <input name="discordRoleTier50k" defaultValue={settings?.discordRoleTier50k ?? undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">10,000원↑ (표시 전용) 역할 ID</label>
          <input name="discordRoleTier10k" defaultValue={settings?.discordRoleTier10k ?? undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">구매자(1원↑) 역할 ID</label>
          <input name="discordRoleBuyer" defaultValue={settings?.discordRoleBuyer ?? undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
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
