import { prisma } from "@/lib/prisma";
import { resolveReportAction, rejectReportAction } from "@/lib/actions/adminReports";

export default async function AdminReportsPage() {
  const reports = await prisma.report.findMany({
    include: { reporter: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">신고 관리</h1>
      <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
        {reports.map((r) => (
          <div key={r.id} className="p-4 flex items-start justify-between gap-4 text-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.reporter.name}</span>
                <span className="text-xs bg-neutral-100 px-1.5 rounded">{r.targetType}</span>
                <span className="text-xs bg-neutral-100 px-1.5 rounded">{r.status}</span>
              </div>
              <p className="mt-1">{r.reason}</p>
              {r.detail && <p className="text-neutral-500 mt-0.5">{r.detail}</p>}
              <p className="text-xs text-neutral-400 mt-1">대상 ID: {r.targetId}</p>
            </div>
            {r.status === "PENDING" && (
              <form className="flex gap-2 shrink-0" action={resolveReportAction}>
                <input type="hidden" name="id" value={r.id} />
                <input name="processResult" placeholder="처리 내용" className="border rounded-md px-2 py-1 text-xs" />
                <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">처리완료</button>
                <button formAction={rejectReportAction} className="text-xs border border-neutral-300 px-2 py-1 rounded hover:bg-neutral-50">
                  기각
                </button>
              </form>
            )}
          </div>
        ))}
        {reports.length === 0 && <p className="text-center text-neutral-400 py-10">신고 내역이 없습니다.</p>}
      </div>
    </div>
  );
}
