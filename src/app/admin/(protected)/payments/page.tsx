import { prisma } from "@/lib/prisma";
import { confirmTopUpAction, rejectTopUpAction } from "@/lib/actions/adminPayments";

export default async function AdminPaymentsPage() {
  const requests = await prisma.pointTopUpRequest.findMany({
    include: { user: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">결제(계좌이체 충전) 관리</h1>
      <p className="text-sm text-neutral-500">
        실제 입금 계좌를 확인한 뒤 아래에서 승인/거절 처리하세요. 승인 시 즉시 포인트가 지급됩니다.
      </p>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">회원</th>
              <th className="text-left px-4 py-2">입금자명</th>
              <th className="text-left px-4 py-2">금액</th>
              <th className="text-left px-4 py-2">신청일</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">처리</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{r.user.name} ({r.user.email})</td>
                <td className="px-4 py-2">{r.depositorName}</td>
                <td className="px-4 py-2">{r.amount.toLocaleString()}원</td>
                <td className="px-4 py-2 text-neutral-400">{r.createdAt.toLocaleString("ko-KR")}</td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2">
                  {r.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <form action={confirmTopUpAction}>
                        <input type="hidden" name="topUpId" value={r.id} />
                        <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                          승인(입금확인)
                        </button>
                      </form>
                      <form action={rejectTopUpAction}>
                        <input type="hidden" name="topUpId" value={r.id} />
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
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-neutral-400 py-10">
                  충전 신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
