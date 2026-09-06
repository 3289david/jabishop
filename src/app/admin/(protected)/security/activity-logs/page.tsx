import { prisma } from "@/lib/prisma";
import { SecurityTabs } from "@/components/admin/SecurityTabs";

export default async function ActivityLogsPage() {
  const logs = await prisma.adminActivityLog.findMany({
    include: { admin: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">관리자 보안</h1>
      <SecurityTabs active="/admin/security/activity-logs" />

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">관리자</th>
              <th className="text-left px-4 py-2">액션</th>
              <th className="text-left px-4 py-2">대상</th>
              <th className="text-left px-4 py-2">상세</th>
              <th className="text-left px-4 py-2">IP</th>
              <th className="text-left px-4 py-2">시각</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{l.admin.loginId}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                <td className="px-4 py-2 text-xs text-neutral-400">{l.target}</td>
                <td className="px-4 py-2 text-neutral-500">{l.detail}</td>
                <td className="px-4 py-2">{l.ip}</td>
                <td className="px-4 py-2 text-neutral-400">{l.createdAt.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-neutral-400 py-10">
                  활동 로그가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
