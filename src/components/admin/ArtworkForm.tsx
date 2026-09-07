"use client";

import { useActionState } from "react";
import type { Artwork, Tier } from "@prisma/client";
import { createArtworkAction, updateArtworkAction, type ActionState } from "@/lib/actions/adminInventory";
import { ARTWORK_CATEGORIES } from "@/lib/constants";

export function ArtworkForm({ artwork, tiers }: { artwork?: Artwork; tiers: Tier[] }) {
  const action = artwork ? updateArtworkAction : createArtworkAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-3 max-w-lg">
      {artwork && <input type="hidden" name="id" value={artwork.id} />}

      {!artwork && (
        <>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">등급</label>
            <select name="tierId" required className="w-full border rounded-md px-3 py-2 text-sm">
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">재고 코드</label>
            <input name="code" placeholder="예: GOLD-0001" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </>
      )}

      <div>
        <label className="block text-xs text-neutral-500 mb-1">제목</label>
        <input name="title" defaultValue={artwork?.title} required className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">카테고리</label>
          <select name="category" defaultValue={artwork?.category} required className="w-full border rounded-md px-3 py-2 text-sm">
            {ARTWORK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">품질/설명</label>
          <input name="quality" defaultValue={artwork?.quality ?? undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
      </div>

      {!artwork && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">가로(px)</label>
            <input name="widthPx" type="number" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">세로(px)</label>
            <input name="heightPx" type="number" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">시리즈 (선택)</label>
            <input name="series" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">캐릭터 (선택)</label>
            <input name="character" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">희귀도 (1~5)</label>
          <input
            name="rarityStars"
            type="number"
            min={1}
            max={5}
            defaultValue={artwork?.rarityStars ?? 1}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="limitedEdition" type="checkbox" defaultChecked={artwork?.limitedEdition} />
          한정판 여부
        </label>
      </div>

      {artwork && (
        <div>
          <label className="block text-xs text-neutral-500 mb-1">판매 상태</label>
          <select name="status" defaultValue={artwork.status} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="AVAILABLE">판매가능</option>
            <option value="HIDDEN">숨김</option>
            <option value="RESERVED" disabled>
              예약됨
            </option>
            <option value="SOLD" disabled>
              판매됨
            </option>
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs text-neutral-500 mb-1">
          계정 원본 파일 {artwork ? "(교체할 경우에만 선택)" : ""}
        </label>
        <input name="file" type="file" accept="image/*" required={!artwork} className="text-sm" />
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">미리보기 이미지 (선택, 비우면 원본 사용)</label>
        <input name="previewFile" type="file" accept="image/*" className="text-sm" />
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
