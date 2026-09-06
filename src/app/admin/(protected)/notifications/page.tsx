import { prisma } from "@/lib/prisma";
import { BroadcastForm } from "@/components/admin/BroadcastForm";

export default async function AdminNotificationsPage() {
  const broadcasts = await prisma.notification.findMany({
    where: { broadcast: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">알림 발송 (전체 공지)</h1>
      <div className="bg-white border border-neutral-200 rounded-xl p-5 max-w-lg">
        <BroadcastForm />
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
        {broadcasts.map((b) => (
          <div key={b.id} className="p-4 text-sm">
            <div className="font-medium">{b.title}</div>
            <p className="text-neutral-500">{b.message}</p>
            <p className="text-xs text-neutral-400 mt-1">{b.createdAt.toLocaleString("ko-KR")}</p>
          </div>
        ))}
        {broadcasts.length === 0 && <p className="text-center text-neutral-400 py-10">발송된 공지가 없습니다.</p>}
      </div>
    </div>
  );
}
