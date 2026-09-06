import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function CouponsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const userCoupons = await prisma.userCoupon.findMany({
    where: { userId: user.id },
    include: { coupon: true },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <h1 className="font-semibold mb-3">보유 쿠폰</h1>
      <div className="space-y-2">
        {userCoupons.map((uc) => (
          <div
            key={uc.id}
            className="border border-dashed border-indigo-300 rounded-lg p-3 flex items-center justify-between text-sm"
          >
            <div>
              <div className="font-medium">{uc.coupon.name}</div>
              <div className="text-neutral-400">
                코드: {uc.coupon.code} · 유효기간 {uc.coupon.validTo.toLocaleDateString("ko-KR")}까지
              </div>
            </div>
            <span className={uc.usedAt ? "text-neutral-400" : "text-indigo-600 font-medium"}>
              {uc.usedAt ? "사용완료" : "사용가능"}
            </span>
          </div>
        ))}
        {userCoupons.length === 0 && (
          <p className="text-neutral-400 py-6 text-center">보유한 쿠폰이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
