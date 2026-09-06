import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ArtworkForm } from "@/components/admin/ArtworkForm";

export default async function EditArtworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [artwork, tiers] = await Promise.all([
    prisma.artwork.findUnique({ where: { id } }),
    prisma.tier.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!artwork) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">그림 수정 - {artwork.code}</h1>
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <img
          src={`/api/files/preview/${artwork.id}`}
          alt={artwork.title}
          className="w-40 h-40 object-cover rounded-lg border border-neutral-200 mb-4"
        />
        <ArtworkForm artwork={artwork} tiers={tiers} />
      </div>
    </div>
  );
}
