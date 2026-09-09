import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { forceCancelOrderAction } from "@/lib/actions/adminOrders";
import { ORDER_STATUS } from "@/lib/constants";
import { ExchangeOrderForm } from "@/components/admin/ExchangeOrderForm";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { user: true, tier: true, artwork: true, coupon: true, refundRequest: true, exchangeRequest: true, review: true },
  });
  if (!order) notFound();

  const cancellable = ([ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.RESERVED] as string[]).includes(order.status);
  const exchangeable = order.status === ORDER_STATUS.COMPLETED && !!order.artwork;

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold">주문 #{order.orderNo}</h1>
      <div className="bg-white border border-neutral-200 rounded-xl p-5 text-sm space-y-2">
        <Row label="회원" value={`${order.user?.name} (${order.user?.email})`} />
        <Row label="상품" value={order.tier.name} />
        <Row label="지급된 계정" value={order.artwork ? `${order.artwork.code} - ${order.artwork.title}` : "-"} />
        <Row label="정가" value={`${order.priceAtPurchase.toLocaleString()}P`} />
        <Row label="할인" value={`-${order.discountAmount.toLocaleString()}P ${order.coupon ? `(${order.coupon.name})` : ""}`} />
        <Row label="결제금액" value={`${order.finalAmount.toLocaleString()}P`} />
        <Row label="상태" value={order.status} />
        <Row label="주문일시" value={order.createdAt.toLocaleString("ko-KR")} />
        {order.firstDownloadedAt && (
          <Row label="최초 다운로드" value={order.firstDownloadedAt.toLocaleString("ko-KR")} />
        )}
        {order.refundRequest && <Row label="환불 상태" value={order.refundRequest.status} />}
        {order.exchangeRequest && (
          <div className="flex justify-between border-b border-neutral-100 py-1.5 last:border-0">
            <span className="text-neutral-400">교환 상태</span>
            <span>
              {order.exchangeRequest.status}
              {order.exchangeRequest.status === "PENDING" && (
                <>
                  {" · "}
                  <Link href="/admin/exchanges" className="text-indigo-600 hover:underline">
                    처리하러 가기
                  </Link>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {cancellable && (
          <form action={forceCancelOrderAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <button className="border border-red-300 text-red-600 px-4 py-2 rounded-md text-sm hover:bg-red-50">
              주문 강제 취소 (재고 복구)
            </button>
          </form>
        )}
        {exchangeable && <ExchangeOrderForm orderId={order.id} />}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-100 py-1.5 last:border-0">
      <span className="text-neutral-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
