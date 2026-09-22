import { prisma } from "@/lib/prisma";
import { approvePartnerAction, rejectPartnerAction } from "@/lib/actions/adminPartners";

export default async function AdminPartnersPage() {
  const partners = await prisma.partner.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">파트너 관리</h1>
      <p className="text-sm text-neutral-500">
        승인하면 관리자 설정에 지정된 파트너 카테고리 밑에 채널이 자동 생성되고, 지정된 역할이 신청자에게
        지급됩니다. 매일 1회 승인된 파트너의 웹훅으로 관리자가 설정한 문구가 자동 발송됩니다.
      </p>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">이름</th>
              <th className="text-left px-4 py-2">신청자</th>
              <th className="text-left px-4 py-2">소개</th>
              <th className="text-left px-4 py-2">웹훅</th>
              <th className="text-left px-4 py-2">채널</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">처리</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 text-xs text-neutral-500">{p.discordTag}</td>
                <td className="px-4 py-2 max-w-xs truncate" title={p.description ?? ""}>
                  {p.description ?? "-"}
                </td>
                <td className="px-4 py-2 text-xs">{p.webhookUrl ? "등록됨" : "없음"}</td>
                <td className="px-4 py-2 text-xs">{p.channelId ?? "-"}</td>
                <td className="px-4 py-2">{p.status}</td>
                <td className="px-4 py-2">
                  {p.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <form action={approvePartnerAction}>
                        <input type="hidden" name="partnerId" value={p.id} />
                        <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                          승인
                        </button>
                      </form>
                      <form action={rejectPartnerAction}>
                        <input type="hidden" name="partnerId" value={p.id} />
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
            {partners.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-neutral-400 py-10">
                  파트너 신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
