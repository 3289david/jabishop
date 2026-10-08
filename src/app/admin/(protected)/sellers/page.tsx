import { prisma } from "@/lib/prisma";
import {
  approveSellerAction,
  rejectSellerAction,
  suspendSellerAction,
  restoreSellerAction,
  expelSellerAction,
  extendSellerAction,
} from "@/lib/actions/adminSellers";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "⏳ 승인 대기",
  ACTIVE: "🟢 활동 중",
  SUSPENDED: "🚨 정지",
  EXPIRED: "❌ 만료(결제실패)",
  REJECTED: "거절됨",
  WITHDRAWN: "퇴출됨",
};

export default async function AdminSellersPage() {
  const sellers = await prisma.seller.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">판매자 관리</h1>
      <p className="text-sm text-neutral-500">
        승인하면 판매자 카테고리 밑에 쇼룸 채널이 자동 생성되고 판매자 역할이 지급됩니다. 이용료는 매달
        판매자의 포인트에서 자동으로 결제되며, 포인트가 부족하면 자동으로 정지(채널 읽기전용 + 역할
        회수)됩니다. 정지/만료된 판매자는 포인트 충전 확인 후 "복구" 또는 "연장"으로 되살릴 수 있습니다.
      </p>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">상점명</th>
              <th className="text-left px-4 py-2">신청자</th>
              <th className="text-left px-4 py-2">카테고리</th>
              <th className="text-left px-4 py-2">평점</th>
              <th className="text-left px-4 py-2">거래</th>
              <th className="text-left px-4 py-2">다음 결제일</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">처리</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => {
              const avg = s.ratingCount > 0 ? (s.ratingSum / s.ratingCount).toFixed(1) : "-";
              return (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{s.storeName}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{s.discordTag}</td>
                  <td className="px-4 py-2 text-xs">{s.category ?? "-"}</td>
                  <td className="px-4 py-2 text-xs">
                    ⭐ {avg} ({s.ratingCount})
                  </td>
                  <td className="px-4 py-2 text-xs">{s.dealCount}건</td>
                  <td className="px-4 py-2 text-xs">
                    {s.nextBillingAt ? s.nextBillingAt.toLocaleDateString("ko-KR") : "-"}
                  </td>
                  <td className="px-4 py-2 text-xs">{STATUS_LABEL[s.status] ?? s.status}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {s.status === "PENDING" && (
                        <>
                          <form action={approveSellerAction}>
                            <input type="hidden" name="sellerId" value={s.id} />
                            <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                              승인
                            </button>
                          </form>
                          <form action={rejectSellerAction}>
                            <input type="hidden" name="sellerId" value={s.id} />
                            <button className="text-xs border border-neutral-300 px-2 py-1 rounded hover:bg-neutral-50">
                              거절
                            </button>
                          </form>
                        </>
                      )}
                      {s.status === "ACTIVE" && (
                        <form action={suspendSellerAction}>
                          <input type="hidden" name="sellerId" value={s.id} />
                          <button className="text-xs border border-red-300 text-red-600 px-2 py-1 rounded hover:bg-red-50">
                            정지
                          </button>
                        </form>
                      )}
                      {(s.status === "SUSPENDED" || s.status === "EXPIRED") && (
                        <>
                          <form action={restoreSellerAction}>
                            <input type="hidden" name="sellerId" value={s.id} />
                            <button className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
                              복구
                            </button>
                          </form>
                          <form action={extendSellerAction} className="flex items-center gap-1">
                            <input type="hidden" name="sellerId" value={s.id} />
                            <input
                              type="number"
                              name="days"
                              defaultValue={30}
                              min={1}
                              className="w-14 border border-neutral-300 rounded px-1 py-1 text-xs"
                            />
                            <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                              연장
                            </button>
                          </form>
                        </>
                      )}
                      {(s.status === "ACTIVE" || s.status === "SUSPENDED" || s.status === "EXPIRED") && (
                        <form action={expelSellerAction}>
                          <input type="hidden" name="sellerId" value={s.id} />
                          <button className="text-xs border border-neutral-300 text-neutral-500 px-2 py-1 rounded hover:bg-neutral-50">
                            퇴출
                          </button>
                        </form>
                      )}
                      {["REJECTED", "WITHDRAWN"].includes(s.status) && (
                        <span className="text-neutral-400 text-xs">처리완료</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sellers.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-neutral-400 py-10">
                  판매자 신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
