import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TierForm } from "@/components/admin/TierForm";

export default async function EditTierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tier = await prisma.tier.findUnique({ where: { id } });
  if (!tier) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">등급 수정 - {tier.name}</h1>
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <TierForm tier={tier} />
      </div>
    </div>
  );
}
