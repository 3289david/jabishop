import { prisma } from "@/lib/prisma";
import { approveRefundAction, rejectRefundAction } from "@/lib/actions/adminRefunds";

export default async function AdminRefundsPage() {
  const refunds = await prisma.refundRequest.findMany({
    include: { user: true, order: { include: { tier: true, artwork: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">환불 관리</h1>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">회원</th>
              <th className="text-left px-4 py-2">주문</th>
              <th className="text-left px-4 py-2">사유</th>
              <th className="text-left px-4 py-2">다운로드여부</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">처리</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{r.user.name}</td>
                <td className="px-4 py-2">
                  #{r.order.orderNo} · {r.order.tier.name} · {r.order.finalAmount.toLocaleString()}P
                </td>
                <td className="px-4 py-2 max-w-xs truncate" title={r.reason}>
                  {r.reason}
                </td>
                <td className="px-4 py-2">{r.order.firstDownloadedAt ? "다운로드함" : "미다운로드"}</td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2">
                  {r.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <form action={approveRefundAction}>
                        <input type="hidden" name="refundId" value={r.id} />
                        <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                          승인
                        </button>
                      </form>
                      <form action={rejectRefundAction}>
                        <input type="hidden" name="refundId" value={r.id} />
                        <button className="text-xs border border-neutral-300 px-2 py-1 rounded hover:bg-neutral-50">
                          거절
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-neutral-400 text-xs">처리완료</span>
                  )}
                </td>
              </tr>
            ))}
            {refunds.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-neutral-400 py-10">
                  환불 요청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
