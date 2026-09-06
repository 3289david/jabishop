import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MemberStatusForm } from "@/components/admin/MemberStatusForm";
import { PointAdjustForm } from "@/components/admin/PointAdjustForm";

export default async function AdminMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();

  const [orders, reviews, inquiries, reports] = await Promise.all([
    prisma.order.findMany({ where: { userId: id }, include: { tier: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.review.count({ where: { userId: id } }),
    prisma.inquiry.count({ where: { userId: id } }),
    prisma.report.count({ where: { reporterId: id } }),
  ]);

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold">{user.name} ({user.email})</h1>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold mb-2 text-sm">계정 상태</h2>
          <MemberStatusForm user={user} />
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold mb-2 text-sm">
            포인트 잔액: <span className="text-indigo-600">{user.points.toLocaleString()}P</span>
          </h2>
          <PointAdjustForm userId={user.id} />
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5 text-sm flex gap-6">
        <span>리뷰 {reviews}건</span>
        <span>문의 {inquiries}건</span>
        <span>신고 {reports}건</span>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 font-semibold text-sm">주문 내역</div>
        <table className="w-full text-sm">
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">#{o.orderNo}</td>
                <td className="px-4 py-2">{o.tier.name}</td>
                <td className="px-4 py-2">{o.finalAmount.toLocaleString()}P</td>
                <td className="px-4 py-2">{o.status}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-neutral-400" colSpan={4}>
                  주문 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
