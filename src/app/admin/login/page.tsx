"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function OAuthError() {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  if (!oauthError) return null;
  return <p className="text-sm text-red-600 mt-3 text-center">{oauthError}</p>;
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="max-w-sm w-full bg-white border border-neutral-200 rounded-xl p-6 text-center">
        <h1 className="text-xl font-bold mb-1">자비샵 관리자</h1>
        <p className="text-sm text-neutral-400 mb-4">
          관리자 로그인은 Discord 계정으로만 가능합니다.
          <br />
          서버 관리자 권한이 있거나, 이미 연동된 관리자 계정만 로그인할 수 있습니다.
        </p>
        <a
          href="/api/auth/discord/admin-start"
          className="flex items-center justify-center gap-2 w-full bg-[#5865F2] text-white py-2.5 rounded-md text-sm font-medium hover:bg-[#4752c4]"
        >
          <span>💬</span> Discord로 관리자 로그인
        </a>
        <Suspense fallback={null}>
          <OAuthError />
        </Suspense>
      </div>
    </div>
  );
}
