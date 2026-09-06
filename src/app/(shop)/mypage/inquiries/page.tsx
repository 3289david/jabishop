import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function InquiriesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const inquiries = await prisma.inquiry.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h1 className="font-semibold">문의 내역</h1>
        <Link
          href="/mypage/inquiries/new"
          className="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-indigo-700"
        >
          문의하기
        </Link>
      </div>
      <div className="divide-y divide-neutral-100 text-sm">
        {inquiries.map((i) => (
          <Link
            key={i.id}
            href={`/mypage/inquiries/${i.id}`}
            className="flex items-center justify-between py-3 hover:text-indigo-600"
          >
            <span>{i.title}</span>
            <span className="text-neutral-400">{i.status}</span>
          </Link>
        ))}
        {inquiries.length === 0 && <p className="text-neutral-400 py-6 text-center">문의 내역이 없습니다.</p>}
      </div>
    </div>
  );
}
