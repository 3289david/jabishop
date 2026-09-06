import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { markAllNotificationsReadAction } from "@/lib/actions/notifications";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const notifications = await prisma.notification.findMany({
    where: { OR: [{ userId: user.id }, { broadcast: true }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h1 className="font-semibold">알림</h1>
        <form action={markAllNotificationsReadAction}>
          <button className="text-xs text-neutral-400 hover:text-indigo-600">모두 읽음 처리</button>
        </form>
      </div>
      <div className="divide-y divide-neutral-100 text-sm">
        {notifications.map((n) => (
          <div key={n.id} className={`py-3 ${n.isRead ? "text-neutral-500" : "font-medium"}`}>
            <div className="flex items-center justify-between">
              <span>{n.title}</span>
              <span className="text-xs text-neutral-400">{n.createdAt.toLocaleString("ko-KR")}</span>
            </div>
            <p className="text-neutral-500 font-normal mt-0.5">{n.message}</p>
          </div>
        ))}
        {notifications.length === 0 && <p className="text-neutral-400 py-6 text-center">알림이 없습니다.</p>}
      </div>
    </div>
  );
}
