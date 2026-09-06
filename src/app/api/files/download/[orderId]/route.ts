import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getCurrentAdmin, getClientInfo } from "@/lib/session";
import { readUploadedFile, guessContentType } from "@/lib/storage";
import { ORDER_STATUS } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { artwork: true },
  });
  if (!order || !order.artwork) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = await getCurrentAdmin();
  if (!admin) {
    const user = await getCurrentUser();
    if (!user || order.userId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (order.status !== ORDER_STATUS.COMPLETED) {
      return NextResponse.json({ error: "다운로드할 수 없는 주문 상태입니다." }, { status: 403 });
    }
  }

  try {
    const buffer = await readUploadedFile(order.artwork.fileKey);

    if (!order.firstDownloadedAt) {
      const { ip, userAgent } = await getClientInfo();
      await prisma.order.update({ where: { id: order.id }, data: { firstDownloadedAt: new Date() } });
      await prisma.downloadLog.create({ data: { orderId: order.id, ip, userAgent } });
    }

    const fileName = `${order.artwork.code}${extOf(order.artwork.fileKey)}`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": guessContentType(order.artwork.fileKey),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}

function extOf(key: string) {
  const idx = key.lastIndexOf(".");
  return idx >= 0 ? key.slice(idx) : "";
}
