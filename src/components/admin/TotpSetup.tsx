"use client";

import { useActionState, useState, useTransition } from "react";
import {
  setupTotpAction,
  enableTotpAction,
  disableTotpAction,
  type ActionState,
} from "@/lib/actions/adminSecurity";

export function TotpSetup({ totpEnabled }: { totpEnabled: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [enableState, enableFormAction, enablePending] = useActionState<ActionState, FormData>(
    enableTotpAction,
    undefined
  );

  if (totpEnabled) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-green-600">2단계 인증이 활성화되어 있습니다.</p>
        <form action={disableTotpAction}>
          <button className="text-sm border border-red-300 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50">
            2FA 비활성화
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!qr ? (
        <button
          onClick={() =>
            startTransition(async () => {
              const result = await setupTotpAction();
              setQr(result.qrDataUrl);
              setSecret(result.secret);
            })
          }
          disabled={isPending}
          className="bg-neutral-900 text-white px-4 py-2 rounded-md text-sm hover:bg-neutral-700 disabled:opacity-50"
        >
          {isPending ? "생성 중..." : "QR 코드 생성"}
        </button>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="TOTP QR" className="w-40 h-40" />
          <p className="text-xs text-neutral-500">
            수동 입력 키: <span className="font-mono">{secret}</span>
          </p>
          <form action={enableFormAction} className="flex gap-2">
            <input
              name="totpToken"
              placeholder="6자리 코드"
              required
              maxLength={6}
              className="border rounded-md px-3 py-2 text-sm w-32"
            />
            <button
              type="submit"
              disabled={enablePending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              활성화
            </button>
          </form>
          {enableState?.error && <p className="text-sm text-red-600">{enableState.error}</p>}
        </div>
      )}
    </div>
  );
}
