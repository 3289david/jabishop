import { NextRequest, NextResponse } from "next/server";
import { verifySolution, sha, type Payload } from "altcha/lib";
import { prisma } from "@/lib/prisma";
import { addGuildMemberRole } from "@/lib/discordNotify";
import { getVerifyPendingSession, clearVerifyPendingSession, getClientInfo } from "@/lib/session";

export async function POST(req: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });

  const pending = await getVerifyPendingSession();
  if (!pending) {
    return NextResponse.json({ error: "디스코드 연결이 만료되었습니다. 다시 시도해주세요." }, { status: 400 });
  }

  const form = await req.formData();
  const altchaValue = form.get("altcha");
  if (typeof altchaValue !== "string") {
    return NextResponse.json({ error: "캡챠 응답이 없습니다." }, { status: 400 });
  }

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(altchaValue, "base64").toString("utf8"));
  } catch {
    return NextResponse.json({ error: "캡챠 응답이 올바르지 않습니다." }, { status: 400 });
  }

  const result = await verifySolution({
    challenge: payload.challenge,
    solution: payload.solution,
    deriveKey: sha.deriveKey,
    hmacSignatureSecret: secret,
  });
  if (!result.verified) {
    return NextResponse.json({ error: "캡챠 인증에 실패했습니다. 다시 시도해주세요." }, { status: 400 });
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!guildId || !settings?.verifyRoleId) {
    return NextResponse.json({ error: "인증 시 지급할 역할이 아직 설정되지 않았습니다. 관리자에게 문의해주세요." }, { status: 503 });
  }

  const granted = await addGuildMemberRole(guildId, pending.discordUserId, settings.verifyRoleId);
  if (!granted) {
    return NextResponse.json(
      { error: "역할 지급에 실패했습니다 - 서버에 먼저 들어와 있는지, 봇 권한을 확인해주세요." },
      { status: 500 }
    );
  }

  const { ip, userAgent } = await getClientInfo();
  await prisma.verificationLog.create({
    data: { discordUserId: pending.discordUserId, discordUsername: pending.discordUsername, ip, userAgent },
  });
  await clearVerifyPendingSession();

  return NextResponse.json({ ok: true });
}
