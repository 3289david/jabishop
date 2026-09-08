import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";
import { readUploadedFile, guessContentType, isUploadKey } from "@/lib/storage";

// 교환 신청 시 첨부한 증빙 파일은 관리자만 열람할 수 있다 (개인정보/스크린샷 포함 가능).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ exchangeId: string }> }
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { exchangeId } = await params;
  const exchange = await prisma.exchangeRequest.findUnique({ where: { id: exchangeId } });
  if (!exchange) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isUploadKey(exchange.proofFileKey)) return NextResponse.json({ error: "no file" }, { status: 404 });

  try {
    const buffer = await readUploadedFile(exchange.proofFileKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": guessContentType(exchange.proofFileKey),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
