import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";

/**
 * 시드 스크립트(prisma/seed.ts)가 만든 데모 계정/그림을 전부 지운다.
 * isSeedData=true로 표시된 행만 대상이며, 실제 관리자 계정이나 관리자가
 * 직접 등록한 재고는 건드리지 않는다.
 *
 * Artwork.reservedOrderId -> Order 외래키가 있어 Order보다 먼저 참조를 끊어야 하고,
 * Order를 참조하는 하위 테이블(리뷰/환불/알림/포인트내역/쿠폰사용/다운로드로그)을
 * 먼저 지운 뒤에야 Order 자체를 지울 수 있다.
 */
export async function purgeSeedData() {
  const seedArtworks = await prisma.artwork.findMany({ where: { isSeedData: true } });

  const result = await prisma.$transaction(async (tx) => {
    const seedUsers = await tx.user.findMany({ where: { isSeedData: true } });
    const seedUserIds = seedUsers.map((u) => u.id);

    const seedOrders = await tx.order.findMany({ where: { userId: { in: seedUserIds } } });
    const seedOrderIds = seedOrders.map((o) => o.id);

    await tx.downloadLog.deleteMany({ where: { orderId: { in: seedOrderIds } } });
    await tx.couponUsage.deleteMany({ where: { orderId: { in: seedOrderIds } } });
    await tx.review.deleteMany({ where: { orderId: { in: seedOrderIds } } });
    await tx.refundRequest.deleteMany({ where: { orderId: { in: seedOrderIds } } });
    await tx.notification.deleteMany({
      where: { OR: [{ userId: { in: seedUserIds } }, { orderId: { in: seedOrderIds } }] },
    });
    await tx.pointTransaction.deleteMany({ where: { userId: { in: seedUserIds } } });

    // Order를 지우기 전에 재고 쪽 외래키(reservedOrderId)부터 끊는다.
    await tx.artwork.updateMany({
      where: { reservedOrderId: { in: seedOrderIds } },
      data: { reservedOrderId: null, reservedAt: null },
    });

    await tx.order.deleteMany({ where: { id: { in: seedOrderIds } } });
    await tx.pointTopUpRequest.deleteMany({ where: { userId: { in: seedUserIds } } });
    await tx.userCoupon.deleteMany({ where: { userId: { in: seedUserIds } } });
    await tx.cartItem.deleteMany({ where: { userId: { in: seedUserIds } } });
    await tx.userSession.deleteMany({ where: { userId: { in: seedUserIds } } });
    await tx.inquiry.deleteMany({ where: { userId: { in: seedUserIds } } });
    await tx.report.deleteMany({ where: { reporterId: { in: seedUserIds } } });

    await tx.user.deleteMany({ where: { id: { in: seedUserIds } } });

    // 주문에 묶여 있던 시드 그림은 위에서 참조가 끊겼으니, 남은 시드 그림 전부를 지운다.
    const deletedArtworks = await tx.artwork.deleteMany({ where: { isSeedData: true } });

    return { deletedUsers: seedUserIds.length, deletedOrders: seedOrderIds.length, deletedArtworks: deletedArtworks.count };
  });

  // DB 트랜잭션이 성공한 뒤 실제 업로드 파일도 정리한다 (실패해도 DB 정합성엔 영향 없음).
  for (const artwork of seedArtworks) {
    await deleteUploadedFile(artwork.fileKey);
    if (artwork.previewKey && artwork.previewKey !== artwork.fileKey) {
      await deleteUploadedFile(artwork.previewKey);
    }
  }

  return result;
}
