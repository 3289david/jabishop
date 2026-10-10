import { prisma } from "@/lib/prisma";

export default async function AdminVerificationsPage() {
  const logs = await prisma.verificationLog.findMany({ orderBy: { verifiedAt: "desc" }, take: 300 });

  const ipCounts = new Map<string, number>();
  for (const log of logs) {
    if (!log.ip) continue;
    ipCounts.set(log.ip, (ipCounts.get(log.ip) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">인증 기록</h1>
      <p className="text-sm text-neutral-500">
        "인증하기" 패널(디스코드 OAuth + ALTCHA)을 통과할 때마다 기록됩니다. 같은 IP가 여러 번 보이면
        한 사람이 여러 계정으로 인증했을 가능성이 있습니다 (아래에 🚩로 표시).
      </p>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">유저</th>
              <th className="text-left px-4 py-2">디스코드 ID</th>
              <th className="text-left px-4 py-2">IP</th>
              <th className="text-left px-4 py-2">User-Agent</th>
              <th className="text-left px-4 py-2">인증 시각</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const duplicateIp = log.ip && (ipCounts.get(log.ip) ?? 0) > 1;
              return (
                <tr key={log.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{log.discordUsername}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{log.discordUserId}</td>
                  <td className="px-4 py-2 text-xs">
                    {duplicateIp && <span className="mr-1">🚩</span>}
                    {log.ip ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500 max-w-xs truncate" title={log.userAgent ?? ""}>
                    {log.userAgent ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-xs">{log.verifiedAt.toLocaleString("ko-KR")}</td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-neutral-400 py-10">
                  인증 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
