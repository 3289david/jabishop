import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

// 관리자 로그인 페이지의 "Discord로 로그인" 전용 시작점.
// 일반 사용자 로그인(/api/auth/discord/start)과 콜백이 분리되어 있어, 여기로 들어온 인증만
// "서버 관리자 권한 확인 → 관리자 세션 발급" 흐름을 탄다.
export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!clientId || !redirectUri || !guildId) {
    return NextResponse.json(
      { error: "Discord 관리자 로그인이 아직 설정되지 않았습니다 (DISCORD_GUILD_ID 필요)." },
      { status: 503 }
    );
  }

  const adminRedirectUri = redirectUri.replace("/callback", "/admin-callback");
  const state = randomUUID();
  const c = await cookies();
  c.set("jbs_oauth_admin_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", adminRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url);
}
