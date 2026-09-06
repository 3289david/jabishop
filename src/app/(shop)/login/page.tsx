"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction, type ActionState } from "@/lib/actions/auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, undefined);
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");

  return (
    <div className="max-w-sm mx-auto bg-white border border-neutral-200 rounded-xl p-6 mt-8">
      <h1 className="text-xl font-bold mb-4">로그인</h1>

      <a
        href="/api/auth/discord/start"
        className="flex items-center justify-center gap-2 w-full bg-[#5865F2] text-white py-2 rounded-md text-sm font-medium hover:bg-[#4752c4] mb-4"
      >
        <span>💬</span> Discord로 로그인
      </a>
      {oauthError && <p className="text-sm text-red-600 mb-3 text-center">{oauthError}</p>}

      <div className="flex items-center gap-3 my-4 text-xs text-neutral-400">
        <div className="flex-1 h-px bg-neutral-200" />
        또는 이메일로 로그인
        <div className="flex-1 h-px bg-neutral-200" />
      </div>

      <form action={formAction} className="space-y-3">
        <input
          name="email"
          type="email"
          placeholder="이메일"
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
          className="w-full bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "처리 중..." : "로그인"}
        </button>
      </form>
      <p className="text-sm text-neutral-500 mt-4 text-center">
        아직 계정이 없으신가요?{" "}
        <Link href="/signup" className="text-indigo-600 hover:underline">
          회원가입
        </Link>
      </p>
    </div>
  );
}
