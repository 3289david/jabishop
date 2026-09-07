"use client";

import { useActionState } from "react";
import type { Tier } from "@prisma/client";
import { importArtworksTxtAction, type ActionState } from "@/lib/actions/adminInventory";

export function TxtImportForm({ tiers }: { tiers: Tier[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(importArtworksTxtAction, undefined);

  return (
    <details className="bg-white border border-neutral-200 rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-medium">TXT 일괄 등록</summary>
      <form action={formAction} className="mt-3 space-y-2">
        <p className="text-xs text-neutral-500">
          한 줄에 하나씩 - 구매 시 그대로 지급될 링크 또는 텍스트를 적으세요. 파일 업로드 없이 줄 수만큼 재고가 즉시
          판매가능 상태로 등록됩니다.
        </p>
        <select name="tierId" required className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">등급 선택</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input name="txt" type="file" accept=".txt,text/plain" required className="text-sm block" />
        {state?.error && <p className="text-sm text-amber-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-neutral-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "업로드 중..." : "업로드"}
        </button>
      </form>
    </details>
  );
}
