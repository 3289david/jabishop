import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AnswerInquiryForm } from "@/components/admin/AnswerInquiryForm";

export default async function AdminInquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inquiry = await prisma.inquiry.findUnique({ where: { id }, include: { user: true } });
  if (!inquiry) notFound();

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold">{inquiry.title}</h1>
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
        <p className="text-xs text-neutral-400">
          {inquiry.user.name} ({inquiry.user.email}) · {inquiry.createdAt.toLocaleString("ko-KR")}
        </p>
        <p className="text-sm whitespace-pre-wrap">{inquiry.content}</p>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h2 className="font-semibold mb-2 text-sm">답변</h2>
        <AnswerInquiryForm inquiry={inquiry} />
      </div>
    </div>
  );
}
