import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleCouponActiveAction } from "@/lib/actions/adminCoupons";
import { IssueCouponForm } from "@/components/admin/IssueCouponForm";

export default async function AdminCouponsPage() {
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { usages: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">쿠폰 관리</h1>
        <Link href="/admin/coupons/new" className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-md hover:bg-indigo-700">
          쿠폰 생성
        </Link>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">코드</th>
              <th className="text-left px-4 py-2">이름</th>
              <th className="text-left px-4 py-2">할인</th>
              <th className="text-left px-4 py-2">사용횟수</th>
              <th className="text-left px-4 py-2">유효기간</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">지급</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono text-xs">{c.code}</td>
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">
                  {c.discountType === "RATE" ? `${c.discountValue}%` : `${c.discountValue.toLocaleString()}원`}
                </td>
                <td className="px-4 py-2">
                  {c._count.usages}
                  {c.usageLimitTotal ? ` / ${c.usageLimitTotal}` : ""}
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500">
                  {c.validFrom.toLocaleDateString("ko-KR")} ~ {c.validTo.toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-2">
                  <form action={toggleCouponActiveAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className={c.active ? "text-green-600 text-xs" : "text-neutral-400 text-xs"}>
                      {c.active ? "사용중" : "중지됨"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2">
                  <IssueCouponForm couponId={c.id} />
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-neutral-400 py-10">
                  등록된 쿠폰이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
