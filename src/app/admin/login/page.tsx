"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { adminLoginAction, adminLoginTotpAction, type ActionState } from "@/lib/actions/adminAuth";

function OAuthError() {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  if (!oauthError) return null;
  return <p className="text-sm text-red-600 mb-3 text-center">{oauthError}</p>;
}

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adminLoginAction, undefined);
  const [totpState, totpFormAction, totpPending] = useActionState<ActionState, FormData>(
    adminLoginTotpAction,
    undefined
  );

  const showTotp = state?.step === "totp";

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="max-w-sm w-full bg-white border border-neutral-200 rounded-xl p-6">
        <h1 className="text-xl font-bold mb-1">자비샵 관리자</h1>
        <p className="text-sm text-neutral-400 mb-4">관리자 전용 로그인 페이지입니다.</p>

        {!showTotp && (
          <>
            <a
              href="/api/auth/discord/admin-start"
              className="flex items-center justify-center gap-2 w-full bg-[#5865F2] text-white py-2 rounded-md text-sm font-medium hover:bg-[#4752c4] mb-3"
            >
              <span>💬</span> Discord 서버 관리자로 로그인
            </a>
            <Suspense fallback={null}>
              <OAuthError />
            </Suspense>
            <div className="flex items-center gap-3 my-3 text-xs text-neutral-400">
              <div className="flex-1 h-px bg-neutral-200" />
              또는 관리자 ID로 로그인
              <div className="flex-1 h-px bg-neutral-200" />
            </div>
          </>
        )}

        {!showTotp ? (
          <form action={formAction} className="space-y-3">
            <input
              name="loginId"
              type="text"
              placeholder="관리자 ID"
              required
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <input
              name="password"
              type="password"
              placeholder="비밀번호"
              required
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full bg-neutral-900 text-white py-2 rounded-md text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
            >
              {pending ? "확인 중..." : "로그인"}
            </button>
          </form>
        ) : (
          <form action={totpFormAction} className="space-y-3">
            <p className="text-sm text-neutral-600">
              등록된 OTP 앱에서 생성된 6자리 인증 코드를 입력해주세요.
            </p>
            <input
              name="totpToken"
              type="text"
              inputMode="numeric"
              placeholder="6자리 인증 코드"
              required
              maxLength={6}
              autoFocus
              className="w-full border rounded-md px-3 py-2 text-sm tracking-widest text-center"
            />
            {totpState?.error && <p className="text-sm text-red-600">{totpState.error}</p>}
            <button
              type="submit"
              disabled={totpPending}
              className="w-full bg-neutral-900 text-white py-2 rounded-md text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
            >
              {totpPending ? "확인 중..." : "인증하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
