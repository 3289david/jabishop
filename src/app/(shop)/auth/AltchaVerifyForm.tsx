"use client";

import { useEffect, useState } from "react";
import "altcha";

export function AltchaVerifyForm({ discordUsername }: { discordUsername: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ALTCHA 위젯 커스텀 엘리먼트는 클라이언트에서만 등록되므로, 등록 전에 서버에서
    // 렌더링된 <altcha-widget>이 그대로 보이지 않게 모듈 로드 이후에만 노출한다.
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/verify/complete", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "인증에 실패했습니다.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="text-center py-10">
        <div className="text-4xl mb-3">✅</div>
        <p className="text-lg font-medium">인증이 완료되었습니다!</p>
        <p className="text-sm text-neutral-500 mt-1">디스코드로 돌아가셔도 됩니다.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-neutral-600">
        디스코드 계정 <span className="font-medium">{discordUsername}</span>로 연결되었습니다. 아래 확인을
        완료하면 인증이 끝납니다.
      </p>
      {/* @ts-expect-error -- altcha-widget은 altcha 패키지가 런타임에 등록하는 커스텀 엘리먼트 */}
      <altcha-widget challenge="/api/verify/challenge" auto="onload" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full bg-indigo-600 text-white rounded-lg py-2.5 font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {status === "submitting" ? "인증 중..." : "인증 완료하기"}
      </button>
    </form>
  );
}
