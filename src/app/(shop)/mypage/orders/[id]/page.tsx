import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS } from "@/lib/constants";
import { ReviewForm } from "@/components/ReviewForm";
import { RefundRequestForm } from "@/components/RefundRequestForm";
import { ExchangeRequestForm } from "@/components/ExchangeRequestForm";
import { ArtworkPreview } from "@/components/ArtworkPreview";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { tier: true, artwork: true, review: true, refundRequest: true, exchangeRequest: true, coupon: true },
  });
  if (!order || order.userId !== user.id) notFound();

  const isCompleted = order.status === ORDER_STATUS.COMPLETED;

  return (
    <div className="space-y-5">
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-lg">주문 #{order.orderNo}</h1>
          <span className="text-sm bg-neutral-100 px-2 py-1 rounded">{order.status}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-400">상품</dt>
            <dd>{order.tier.name}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">정가</dt>
            <dd>{order.priceAtPurchase.toLocaleString()}P</dd>
          </div>
          {order.discountAmount > 0 && (
            <div>
              <dt className="text-neutral-400">할인</dt>
              <dd>-{order.discountAmount.toLocaleString()}P {order.coupon ? `(${order.coupon.name})` : ""}</dd>
            </div>
          )}
          <div>
            <dt className="text-neutral-400">결제 금액</dt>
            <dd className="font-semibold">{order.finalAmount.toLocaleString()}P</dd>
          </div>
          <div>
            <dt className="text-neutral-400">주문일시</dt>
            <dd>{order.createdAt.toLocaleString("ko-KR")}</dd>
          </div>
        </dl>
      </div>

      {order.artwork && isCompleted && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold mb-3">지급된 계정</h2>
          <div className="flex gap-4">
            <ArtworkPreview
              artworkId={order.artwork.id}
              previewKey={order.artwork.previewKey}
              fileKey={order.artwork.fileKey}
              title={order.artwork.title}
              className="w-40 h-40"
            />
            <div className="text-sm space-y-1">
              <div className="font-medium">{order.artwork.title}</div>
              <a
                href={`/api/files/download/${order.id}`}
                className="inline-block mt-2 bg-indigo-600 text-white text-sm px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                파일 받기
              </a>
              {order.firstDownloadedAt && (
                <p className="text-xs text-neutral-400 mt-1">
                  최초 다운로드: {order.firstDownloadedAt.toLocaleString("ko-KR")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {isCompleted && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold mb-3">리뷰</h2>
          {order.review ? (
            <div className="text-sm">
              <span className="text-amber-500">{"★".repeat(order.review.rating)}</span>
              <p className="mt-1">{order.review.content}</p>
            </div>
          ) : (
            <ReviewForm orderId={order.id} />
          )}
        </div>
      )}

      {isCompleted && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold mb-3">환불</h2>
          {order.refundRequest ? (
            <div className="text-sm space-y-1">
              <p>
                상태: <span className="font-medium">{order.refundRequest.status}</span>
              </p>
              <p className="text-neutral-500">사유: {order.refundRequest.reason}</p>
              {order.refundRequest.adminNote && (
                <p className="text-neutral-500">관리자 메모: {order.refundRequest.adminNote}</p>
              )}
            </div>
          ) : (
            <RefundRequestForm orderId={order.id} />
          )}
        </div>
      )}

      {isCompleted && order.artwork && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold mb-3">계정 교환</h2>
          {order.exchangeRequest ? (
            <div className="text-sm space-y-1">
              <p>
                상태: <span className="font-medium">{order.exchangeRequest.status}</span>
              </p>
              <p className="text-neutral-500">사유: {order.exchangeRequest.reason}</p>
              {order.exchangeRequest.adminNote && (
                <p className="text-neutral-500">관리자 메모: {order.exchangeRequest.adminNote}</p>
              )}
            </div>
          ) : (
            <ExchangeRequestForm orderId={order.id} />
          )}
        </div>
      )}
    </div>
  );
}
