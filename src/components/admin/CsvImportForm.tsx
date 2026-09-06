"use client";

import { useActionState } from "react";
import { importArtworksCsvAction, type ActionState } from "@/lib/actions/adminInventory";

export function CsvImportForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(importArtworksCsvAction, undefined);

  return (
    <details className="bg-white border border-neutral-200 rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-medium">CSV 일괄 등록</summary>
      <form action={formAction} className="mt-3 space-y-2">
        <p className="text-xs text-neutral-500">
          헤더: code,tierSlug,title,category,quality,widthPx,heightPx,fileFormat,series,character,rarityStars
          <br />
          파일 없이 상품 데이터만 먼저 등록되며, 이후 각 항목을 열어 실제 그림 파일을 업로드해야 판매 가능 상태가 됩니다.
        </p>
        <input name="csv" type="file" accept=".csv,text/csv" required className="text-sm" />
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
