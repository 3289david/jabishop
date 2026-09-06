import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry || inquiry.userId !== user.id) notFound();

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-lg">{inquiry.title}</h1>
          <span className="text-sm bg-neutral-100 px-2 py-1 rounded">{inquiry.status}</span>
        </div>
        <p className="text-xs text-neutral-400 mt-1">
          {inquiry.createdAt.toLocaleString("ko-KR")}
        </p>
      </div>
      <p className="whitespace-pre-wrap text-sm">{inquiry.content}</p>

      {inquiry.answer && (
        <div className="bg-indigo-50 rounded-lg p-4">
          <p className="text-xs font-semibold text-indigo-600 mb-1">관리자 답변</p>
          <p className="text-sm whitespace-pre-wrap">{inquiry.answer}</p>
        </div>
      )}
    </div>
  );
}
