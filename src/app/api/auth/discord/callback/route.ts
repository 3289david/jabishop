import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createUserSession } from "@/lib/session";
import { USER_STATUS } from "@/lib/constants";
// bot/discordAuth.ts는 prisma/constants에만 의존하는 순수 로직이라 봇과 웹사이트 양쪽에서 그대로 재사용한다.
import { getOrCreateShopUser } from "@/bot/discordAuth";

function loginError(req: NextRequest, message: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const c = await cookies();
  const savedState = c.get("jbs_oauth_state")?.value;
  c.delete("jbs_oauth_state");

  if (!code || !state || !savedState || state !== savedState) {
    return loginError(req, "인증 요청이 유효하지 않습니다. 다시 시도해주세요.");
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return loginError(req, "Discord 로그인이 아직 설정되지 않았습니다.");
  }

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) return loginError(req, "Discord 인증에 실패했습니다.");
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) return loginError(req, "Discord 사용자 정보를 가져오지 못했습니다.");
  const discordUser = (await userRes.json()) as { id: string; username: string; global_name: string | null };

  const displayName = discordUser.global_name || discordUser.username;
  const user = await getOrCreateShopUser(discordUser.id, displayName);

  if (user.status === USER_STATUS.SUSPENDED) return loginError(req, "이용이 정지된 계정입니다.");
  if (user.status === USER_STATUS.WITHDRAWN) return loginError(req, "탈퇴한 계정입니다.");

  // 봇에서 먼저 생성된 계정이라 이름이 디스코드 태그 그대로일 수 있으니 최신 표시 이름으로 갱신한다.
  if (user.name !== displayName) {
    await prisma.user.update({ where: { id: user.id }, data: { name: displayName } });
  }

  await createUserSession(user.id);
  return NextResponse.redirect(new URL("/mypage", req.url));
}
