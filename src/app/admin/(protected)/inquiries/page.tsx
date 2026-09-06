import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminInquiriesPage() {
  const inquiries = await prisma.inquiry.findMany({
    include: { user: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">문의 관리</h1>
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">회원</th>
              <th className="text-left px-4 py-2">제목</th>
              <th className="text-left px-4 py-2">상태</th>
              <th className="text-left px-4 py-2">등록일</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.map((i) => (
              <tr key={i.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{i.user.name}</td>
                <td className="px-4 py-2">
                  <Link href={`/admin/inquiries/${i.id}`} className="text-indigo-600 hover:underline">
                    {i.title}
                  </Link>
                </td>
                <td className="px-4 py-2">{i.status}</td>
                <td className="px-4 py-2 text-neutral-400">{i.createdAt.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
            {inquiries.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-neutral-400 py-10">
                  문의가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
