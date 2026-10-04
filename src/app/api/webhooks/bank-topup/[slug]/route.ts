import { NextRequest, NextResponse } from "next/server";
import { prisma, runWithTenant } from "@/lib/prisma";
import { handleBankTopupWebhook } from "@/lib/bankWebhook";

// "자판기 판매"로 생긴 테넌트 샵은 전용 웹사이트가 없어서, 입금알림 앱은 자비샵 본인
// 웹서버(jabishop.krl.kr)의 이 경로로 보낸다 - slug로 어느 샵인지 찾아서 그 샵의
// DB에 연결한 상태로 처리한다 (비밀키도 당연히 그 샵 전용 값으로 검증됨).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await prisma.shop.findUnique({ where: { slug } });
  if (!shop || shop.status !== "ACTIVE") {
    return NextResponse.json({ error: "shop not found" }, { status: 404 });
  }
  return runWithTenant(shop.dbPath, () => handleBankTopupWebhook(req));
}
