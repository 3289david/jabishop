"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function OAuthError() {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  if (!oauthError) return null;
  return <p className="text-sm text-red-600 mt-3 text-center">{oauthError}</p>;
}

export default function LoginPage() {
  return (
    <div className="max-w-sm mx-auto bg-white border border-neutral-200 rounded-xl p-6 mt-8 text-center">
      <h1 className="text-xl font-bold mb-2">로그인 / 회원가입</h1>
      <p className="text-sm text-neutral-500 mb-4">
        자비샵은 Discord 계정으로만 이용할 수 있습니다.
        <br />
        버튼 하나로 로그인과 회원가입이 함께 처리됩니다.
      </p>
      <a
        href="/api/auth/discord/start"
        className="flex items-center justify-center gap-2 w-full bg-[#5865F2] text-white py-2.5 rounded-md text-sm font-medium hover:bg-[#4752c4]"
      >
        <span>💬</span> Discord로 계속하기
      </a>
      <Suspense fallback={null}>
        <OAuthError />
      </Suspense>
    </div>
  );
}
