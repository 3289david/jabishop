import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getCurrentAdmin } from "@/lib/session";
import { readUploadedFile, guessContentType } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ artworkId: string }> }
) {
  const { artworkId } = await params;
  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    include: { order: true },
  });
  if (!artwork) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = await getCurrentAdmin();
  if (!admin) {
    // 관리자가 아니라면, 이 계정을 실제로 구매/수령한 본인만 미리보기를 볼 수 있다.
    const user = await getCurrentUser();
    const ownsIt = user && artwork.order?.userId === user.id;
    if (!ownsIt) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const key = artwork.previewKey || artwork.fileKey;
  try {
    const buffer = await readUploadedFile(key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": guessContentType(key),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
