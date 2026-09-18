"use client";

import { bulkDeleteArtworksByTierAction } from "@/lib/actions/adminInventory";

export function BulkDeleteStockButton({ tierId, tierName }: { tierId: string; tierName: string }) {
  return (
    <form
      action={bulkDeleteArtworksByTierAction}
      onSubmit={(e) => {
        if (
          !confirm(
            `"${tierName}" 등급의 판매되지 않은 재고를 전부 삭제할까요?\n(이미 판매/예약/교환된 재고는 주문 기록 보존을 위해 삭제되지 않습니다)`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="tierId" value={tierId} />
      <button className="text-xs text-red-500 hover:underline">재고 일괄삭제</button>
    </form>
  );
}
