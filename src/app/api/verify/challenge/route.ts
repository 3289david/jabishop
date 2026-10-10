import { NextResponse } from "next/server";
import { createChallenge, sha } from "altcha/lib";

// ALTCHA(자체 호스팅 프라이버시 캡챠) 챌린지 발급 - 외부 캡챠 서비스 API 키 없이
// 서버에서 직접 서명해서 내려준다. 위젯이 이걸 풀어서 /api/verify/complete로 제출한다.
export async function GET() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });

  const challenge = await createChallenge({
    algorithm: "SHA-256",
    deriveKey: sha.deriveKey,
    cost: 100_000,
    hmacSignatureSecret: secret,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  return NextResponse.json(challenge);
}
