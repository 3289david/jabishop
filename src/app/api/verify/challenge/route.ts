import { NextResponse } from "next/server";
import { createChallenge, sha } from "altcha/lib";

// ALTCHA(자체 호스팅 프라이버시 캡챠) 챌린지 발급 - 외부 캡챠 서비스 API 키 없이
// 서버에서 직접 서명해서 내려준다. 위젯이 이걸 풀어서 /api/verify/complete로 제출한다.
//
// cost는 "한 번의 시도당 체이닝할 SHA-256 반복 횟수"다 (PBKDF2 느낌). 기본
// keyPrefix가 1바이트("00")라 평균 256번 시도가 필요하므로, 실제 총 연산량은
// cost*256 수준 - cost=100_000이면 약 2,560만 회 연속 해시라 모바일에서 수 분씩
// 걸렸음(인증하기 응답 지연 버그). 어차피 이 캡챠는 디스코드 로그인 뒤의 가벼운
// 봇 방지용일 뿐이라, 체감상 거의 즉시 풀리는 수준(cost=10, 총 ~2,500회)으로 낮춤.
export async function GET() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });

  const challenge = await createChallenge({
    algorithm: "SHA-256",
    deriveKey: sha.deriveKey,
    cost: 10,
    hmacSignatureSecret: secret,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  return NextResponse.json(challenge);
}
