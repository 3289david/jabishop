import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { confirmTopUp, TopUpError } from "@/lib/points";
import { depositorNamesMatch } from "@/lib/bankNotifier";
import { notifyAllAdmins } from "@/lib/discordNotify";
import { TOPUP_STATUS } from "@/lib/constants";

// 안드로이드 알림 리스너 앱이 은행 입금 알림을 감지하면 이 엔드포인트로 보낸다.
// body: { amount: number, depositorName: string, timestamp: number(ms), rawText?: string }
// header: X-Signature: HMAC-SHA256(BANK_WEBHOOK_SECRET, rawBody) hex

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5분 - 이보다 오래된/미래의 알림은 재전송 공격 방지를 위해 거부

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(signatureHeader.trim(), "hex");
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}

export async function POST(req: NextRequest) {
  const secret = process.env.BANK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: { amount?: number; depositorName?: string; timestamp?: number; rawText?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { amount, depositorName, timestamp, rawText } = payload;
  if (!timestamp) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) {
    return NextResponse.json({ error: "stale or future timestamp" }, { status: 400 });
  }

  // 폰에서 알림 문구를 파싱하는 과정이라 금액/입금자명을 못 읽어낼 수도 있다 - 그런 경우
  // 자동승인은 시도하지 않고, 원문을 관리자에게 알려서 수동으로 확인할 수 있게만 한다.
  const candidates =
    amount && amount > 0 && depositorName
      ? await prisma.pointTopUpRequest.findMany({
          where: { status: TOPUP_STATUS.PENDING, amount },
          include: { user: true },
        })
      : [];
  const matches = depositorName ? candidates.filter((c) => depositorNamesMatch(c.depositorName, depositorName)) : [];

  if (matches.length === 1) {
    const match = matches[0];
    try {
      await confirmTopUp(match.id, "AUTO:bank-notifier");
    } catch (e) {
      if (e instanceof TopUpError) {
        return NextResponse.json({ error: e.message }, { status: 409 });
      }
      throw e;
    }
    await notifyAllAdmins({
      title: "✅ 자동 충전 승인",
      description: `**${match.user.name}**: ${match.amount.toLocaleString()}원 (입금자: ${depositorName})\n은행 알림을 감지해 자동으로 승인되었습니다.`,
      color: 0x22c55e,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
    return NextResponse.json({ ok: true, matched: match.id });
  }

  // 0건(대기중인 신청과 매칭 안 됨/파싱 실패) 또는 2건 이상(애매함) - 잘못 승인하는 것보다 사람이 보는 게 안전하다.
  await notifyAllAdmins({
    title: matches.length > 1 ? "⚠️ 입금 알림 - 복수 후보 (자동승인 보류)" : "⚠️ 미매칭 입금 알림",
    description: [
      amount ? `금액: ${amount.toLocaleString()}원` : "금액: (인식 실패)",
      depositorName ? `입금자(알림): ${depositorName}` : "입금자: (인식 실패)",
      rawText ? `원문: ${rawText}` : null,
      matches.length > 1
        ? `일치 후보: ${matches.map((m) => `${m.user.name}(${m.depositorName})`).join(", ")}`
        : "대기중인 충전 신청 중 일치하는 건이 없습니다.",
      "/admin/payments 에서 직접 확인해주세요.",
    ]
      .filter(Boolean)
      .join("\n"),
    color: 0xf59e0b,
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  return NextResponse.json({ ok: true, matched: null, candidateCount: matches.length });
}
