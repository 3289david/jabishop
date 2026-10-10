import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

// "인증하기" 링크 버튼이 이 라우트로 들어오면 디스코드 인가 화면으로 보낸다. 기존
// 쇼핑몰 로그인(/api/auth/discord/start)과 똑같은 redirect_uri를 그대로 쓰고
// (디스코드 개발자 포털에 새 리다이렉트 URI를 추가 등록할 필요가 없음), 대신 별도
// 쿠키(jbs_oauth_purpose=verify)로 표시해두면 콜백 라우트가 "로그인"이 아니라
// "인증하기" 흐름으로 처리한다.
export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "디스코드 연동이 아직 설정되지 않았습니다. 관리자에게 문의해주세요." }, { status: 503 });
  }

  const state = randomUUID();
  const c = await cookies();
  c.set("jbs_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  c.set("jbs_oauth_purpose", "verify", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url);
}
