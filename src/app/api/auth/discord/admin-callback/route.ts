import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createAdminSession, getClientInfo } from "@/lib/session";
import { isDiscordGuildAdmin } from "@/bot/discordAuth";
import { ADMIN_STATUS } from "@/lib/constants";

function adminLoginError(req: NextRequest, message: string) {
  const url = new URL("/admin/login", req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const c = await cookies();
  const savedState = c.get("jbs_oauth_admin_state")?.value;
  c.delete("jbs_oauth_admin_state");

  if (!code || !state || !savedState || state !== savedState) {
    return adminLoginError(req, "인증 요청이 유효하지 않습니다. 다시 시도해주세요.");
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI?.replace("/callback", "/admin-callback");
  if (!clientId || !clientSecret || !redirectUri) {
    return adminLoginError(req, "Discord 관리자 로그인이 아직 설정되지 않았습니다.");
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
  if (!tokenRes.ok) return adminLoginError(req, "Discord 인증에 실패했습니다.");
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) return adminLoginError(req, "Discord 사용자 정보를 가져오지 못했습니다.");
  const discordUser = (await userRes.json()) as { id: string; username: string; global_name: string | null };

  const { ip, userAgent } = await getClientInfo();

  // 이미 연동된 관리자 계정이 있다면, 지금 이 순간의 디스코드 서버 권한과 무관하게 로그인시킨다.
  // (예: 관리자 계정 생성 후 /관리자연동으로 연결한 STAFF/MANAGER는 서버 Administrator 권한이 없을 수 있다.)
  let admin = await prisma.adminUser.findUnique({ where: { discordId: discordUser.id } });

  if (!admin) {
    // 아직 연동된 계정이 없는 경우에만, 실제 디스코드 서버 관리자 권한을 확인해 최초 부트스트랩으로 발급한다.
    // 로그인 수단이 Discord뿐이므로 이 경로가 유일한 관리자 발급 경로이며, 서버 최고 권한자이므로 SUPER로 발급한다.
    const isServerAdmin = await isDiscordGuildAdmin(discordUser.id);
    if (!isServerAdmin) {
      return adminLoginError(req, "디스코드 서버 관리자 권한이 없어 로그인할 수 없습니다.");
    }

    // 비밀번호는 본인이 알 수 없는 무작위 값으로 채워두며(로그인은 Discord로만 함),
    // 다른 관리자를 초대할 때는 SUPER가 /admin/security/admins에서 계정을 만든 뒤
    // 그 비밀번호를 알려주면 초대받은 사람이 봇의 /관리자연동으로 자기 Discord 계정과 연결하면 된다.
    const randomPassword = randomBytes(24).toString("hex");
    admin = await prisma.adminUser.create({
      data: {
        loginId: `discord_${discordUser.id}`,
        passwordHash: await hashPassword(randomPassword),
        name: discordUser.global_name || discordUser.username,
        role: "SUPER",
        discordId: discordUser.id,
      },
    });
    await prisma.adminActivityLog.create({
      data: { adminId: admin.id, action: "DISCORD_AUTO_PROVISION", detail: `@${discordUser.username}`, ip },
    });
  }

  if (admin.status !== ADMIN_STATUS.ACTIVE) {
    return adminLoginError(req, "비활성화된 관리자 계정입니다.");
  }

  await prisma.adminLoginLog.create({
    data: { adminId: admin.id, loginId: admin.loginId, ip, userAgent, success: true, reason: "Discord 서버 관리자 로그인" },
  });
  await createAdminSession(admin.id);
  return NextResponse.redirect(new URL("/admin", req.url));
}
