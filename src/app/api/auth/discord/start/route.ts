import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

// "Discord로 로그인/가입" 버튼이 이 라우트로 들어오면, CSRF 방지용 state를 발급해
// 쿠키에 저장해두고 디스코드 인가 화면으로 리다이렉트한다.
export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Discord 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해주세요." },
      { status: 503 }
    );
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

  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url);
}
