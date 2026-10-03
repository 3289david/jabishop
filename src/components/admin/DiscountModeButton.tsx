"use client";

export function DiscountModeButton({ enabled, action }: { enabled: boolean; action: (formData: FormData) => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const msg = enabled
          ? '할인 모드를 끌까요? "한섭 " 등급들의 가격이 할인 전 가격으로 되돌아갑니다.'
          : '할인 모드를 켤까요? "한섭 " 등급들의 가격이 대응되는 일반 등급과 같아집니다.';
        if (!confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="enabled" value={(!enabled).toString()} />
      <button
        className={`text-sm px-3 py-2 rounded-md border ${
          enabled ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600" : "border-neutral-300 hover:bg-neutral-50"
        }`}
      >
        할인 모드 {enabled ? "ON" : "OFF"}
      </button>
    </form>
  );
}
