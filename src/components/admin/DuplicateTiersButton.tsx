"use client";

export function DuplicateTiersButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm('현재 모든 등급을 "한섭 " 접두사를 붙여 복제할까요? (재고는 없이 등급만 복제되며, 이미 복제된 등급은 건너뜁니다)')) {
          e.preventDefault();
        }
      }}
    >
      <button className="border border-neutral-300 text-sm px-3 py-2 rounded-md hover:bg-neutral-50">
        전체 복제 (한섭)
      </button>
    </form>
  );
}
