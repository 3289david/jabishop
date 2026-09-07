import { prisma } from "@/lib/prisma";
import { ArtworkForm } from "@/components/admin/ArtworkForm";

export default async function NewArtworkPage() {
  const tiers = await prisma.tier.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">계정 추가</h1>
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <ArtworkForm tiers={tiers} />
      </div>
    </div>
  );
}
