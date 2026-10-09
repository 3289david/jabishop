import { prisma } from "@/lib/prisma";
import { computePromoStaffStats } from "@/lib/promoStaff";
import { addPromoStaffAction, removePromoStaffAction } from "@/lib/actions/adminPromoStaff";

export default async function AdminPromoStaffPage() {
  const staffList = await prisma.promoStaff.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const stats = await Promise.all(staffList.map((s) => computePromoStaffStats(s.id)));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">홍보직원 관리</h1>
      <p className="text-sm text-neutral-500">
        추가하면 디스코드 영구 초대 링크가 자동 발급되어 DM으로 전달됩니다. 그 링크로 서버에 들어온 사람
        수만큼 1명당 100원, 그중 500원 이상 구매한 사람마다 200원이 추가로 계산됩니다. 실제 지급은 매주
        금요일 관리자에게 DM으로 안내되는 계좌로 수동 송금합니다 (이 시스템이 자동으로 포인트/돈을
        지급하지는 않습니다).
      </p>

      <form action={addPromoStaffAction} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">디스코드 유저 ID</label>
          <input
            name="discordUserId"
            placeholder="예: 1234567890123456789"
            className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-56"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">표시 이름</label>
          <input name="name" placeholder="닉네임" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-40" required />
        </div>
        <button className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">홍보직원 추가</button>
      </form>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">이름</th>
              <th className="text-left px-4 py-2">디스코드 ID</th>
              <th className="text-left px-4 py-2">초대 링크</th>
              <th className="text-left px-4 py-2">초대 인원</th>
              <th className="text-left px-4 py-2">500원↑ 구매자</th>
              <th className="text-left px-4 py-2">정산 예정액</th>
              <th className="text-left px-4 py-2">계좌 정보</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">처리</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((s, i) => {
              const stat = stats[i];
              return (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{s.discordUserId}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className="text-indigo-600">discord.gg/{s.inviteCode}</span>
                  </td>
                  <td className="px-4 py-2 text-xs">{stat.inviteCount}명</td>
                  <td className="px-4 py-2 text-xs">{stat.qualifyingCount}명</td>
                  <td className="px-4 py-2 text-xs font-medium">{stat.amountDue.toLocaleString()}원</td>
                  <td className="px-4 py-2 text-xs">
                    {s.bankName ? (
                      <span>
                        {s.bankName} {s.bankAccountNumber} ({s.accountHolder})
                      </span>
                    ) : (
                      <span className="text-neutral-400">미등록</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">{s.status === "ACTIVE" ? "🟢 활동 중" : "❌ 그만둠"}</td>
                  <td className="px-4 py-2">
                    {s.status === "ACTIVE" && (
                      <form action={removePromoStaffAction}>
                        <input type="hidden" name="discordUserId" value={s.discordUserId} />
                        <button className="text-xs border border-neutral-300 text-neutral-500 px-2 py-1 rounded hover:bg-neutral-50">
                          그만두기
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-neutral-400 py-10">
                  등록된 홍보직원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
