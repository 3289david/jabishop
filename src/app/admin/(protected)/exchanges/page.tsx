import { prisma } from "@/lib/prisma";
import { approveExchangeAction, rejectExchangeAction } from "@/lib/actions/adminExchanges";

export default async function AdminExchangesPage() {
  const exchanges = await prisma.exchangeRequest.findMany({
    include: { user: true, order: { include: { tier: true, artwork: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">교환 관리</h1>
      <p className="text-sm text-neutral-500">
        승인하면 같은 등급의 다른 재고로 즉시 교환되어 새 계정이 Discord DM으로 재발송됩니다. 기존 계정은 무효
        처리되어 재판매되지 않습니다.
      </p>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">회원</th>
              <th className="text-left px-4 py-2">주문</th>
              <th className="text-left px-4 py-2">사유</th>
              <th className="text-left px-4 py-2">증빙</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">처리</th>
            </tr>
          </thead>
          <tbody>
            {exchanges.map((ex) => (
              <tr key={ex.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{ex.user.name}</td>
                <td className="px-4 py-2">
                  #{ex.order.orderNo} · {ex.order.tier.name}
                  {ex.order.artwork && ` · ${ex.order.artwork.code}`}
                </td>
                <td className="px-4 py-2 max-w-xs truncate" title={ex.reason}>
                  {ex.reason}
                </td>
                <td className="px-4 py-2">
                  <a
                    href={`/api/files/exchange-proof/${ex.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline text-xs"
                  >
                    파일 보기
                  </a>
                </td>
                <td className="px-4 py-2">{ex.status}</td>
                <td className="px-4 py-2">
                  {ex.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <form action={approveExchangeAction}>
                        <input type="hidden" name="exchangeId" value={ex.id} />
                        <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                          승인(교환 실행)
                        </button>
                      </form>
                      <form action={rejectExchangeAction}>
                        <input type="hidden" name="exchangeId" value={ex.id} />
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
            {exchanges.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-neutral-400 py-10">
                  교환 요청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
