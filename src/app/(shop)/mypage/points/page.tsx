import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TopUpForm } from "@/components/TopUpForm";

export default async function PointsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [settings, txs, topUps] = await Promise.all([
    prisma.shopSetting.findUnique({ where: { id: "singleton" } }),
    prisma.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.pointTopUpRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <p className="text-sm text-neutral-400">보유 포인트</p>
        <p className="text-2xl font-bold text-indigo-600">{user.points.toLocaleString()}P</p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h2 className="font-semibold mb-2">계좌이체로 포인트 충전</h2>
        <div className="text-sm bg-neutral-50 rounded-md p-3 mb-3 text-neutral-600">
          <p>
            입금 계좌: <span className="font-medium">{settings?.bankName} {settings?.bankAccountNumber}</span> (예금주:{" "}
            {settings?.bankAccountHolder})
          </p>
          <p className="mt-1">입금 후 아래 양식으로 신청하면, 관리자가 입금 확인 후 포인트를 지급합니다.</p>
          {settings?.noticeMessage && <p className="mt-1 text-neutral-400">{settings.noticeMessage}</p>}
        </div>
        <TopUpForm />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h2 className="font-semibold mb-2">충전 신청 내역</h2>
        <div className="divide-y divide-neutral-100 text-sm">
          {topUps.map((t) => (
            <div key={t.id} className="flex justify-between py-2">
              <span>
                {t.amount.toLocaleString()}원 (입금자: {t.depositorName})
              </span>
              <span
                className={
                  t.status === "CONFIRMED"
                    ? "text-green-600"
                    : t.status === "REJECTED"
                    ? "text-red-500"
                    : "text-neutral-400"
                }
              >
                {t.status}
              </span>
            </div>
          ))}
          {topUps.length === 0 && <p className="text-neutral-400 py-4">충전 신청 내역이 없습니다.</p>}
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h2 className="font-semibold mb-2">포인트 내역</h2>
        <div className="divide-y divide-neutral-100 text-sm">
          {txs.map((t) => (
            <div key={t.id} className="flex justify-between py-2">
              <span>
                {t.memo ?? t.type} · {t.createdAt.toLocaleString("ko-KR")}
              </span>
              <span className={t.amount >= 0 ? "text-green-600" : "text-neutral-700"}>
                {t.amount >= 0 ? "+" : ""}
                {t.amount.toLocaleString()}P
              </span>
            </div>
          ))}
          {txs.length === 0 && <p className="text-neutral-400 py-4">포인트 내역이 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}
