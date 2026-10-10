import { getVerifyPendingSession } from "@/lib/session";
import { AltchaVerifyForm } from "./AltchaVerifyForm";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const pending = await getVerifyPendingSession();

  return (
    <div className="max-w-md mx-auto bg-white border border-neutral-200 rounded-xl p-6">
      <h1 className="text-lg font-bold mb-4 text-center">💕 서버 인증</h1>
      {sp.error && <p className="text-sm text-red-600 mb-4 text-center">{sp.error}</p>}

      {pending ? (
        <AltchaVerifyForm discordUsername={pending.discordUsername} />
      ) : (
        <div className="text-center space-y-4">
          <p className="text-sm text-neutral-600">먼저 디스코드 계정을 연결해주세요.</p>
          <a
            href="/api/auth/discord/verify-start"
            className="inline-block w-full bg-indigo-600 text-white rounded-lg py-2.5 font-medium hover:bg-indigo-700"
          >
            디스코드로 연결하기
          </a>
        </div>
      )}
    </div>
  );
}
