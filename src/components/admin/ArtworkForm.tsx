"use client";

import { useActionState } from "react";
import type { Artwork, Tier } from "@prisma/client";
import { createArtworkAction, updateArtworkAction, type ActionState } from "@/lib/actions/adminInventory";

function isUploadedFileKey(key: string | null): boolean {
  return !!key && /^(artworks|previews)\//.test(key);
}

export function ArtworkForm({
  artwork,
  tiers,
  defaultTierId,
}: {
  artwork?: Artwork;
  tiers: Tier[];
  defaultTierId?: string;
}) {
  const action = artwork ? updateArtworkAction : createArtworkAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-3 max-w-lg">
      {artwork && <input type="hidden" name="id" value={artwork.id} />}

      {!artwork && (
        <>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">등급</label>
            <select name="tierId" required defaultValue={defaultTierId} className="w-full border rounded-md px-3 py-2 text-sm">
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
        <label className="block text-xs text-neutral-500 mb-1">
          미리보기 (선택, 비우면 원본 파일 사용) — 이미지 URL 또는 설명 텍스트를 입력하세요. 파일 업로드가 아니라
          텍스트라서 서버 용량을 거의 차지하지 않습니다.
        </label>
        <input
          name="previewText"
          type="text"
          placeholder="https://... 또는 자유 텍스트"
          defaultValue={artwork && !isUploadedFileKey(artwork.previewKey) ? artwork.previewKey ?? "" : ""}
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
