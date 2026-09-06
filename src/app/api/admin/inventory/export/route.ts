import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/session";

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const artworks = await prisma.artwork.findMany({
    include: { tier: true },
    orderBy: { createdAt: "desc" },
  });

  const header = [
    "code",
    "tierSlug",
    "title",
    "category",
    "quality",
    "widthPx",
    "heightPx",
    "fileFormat",
    "series",
    "character",
    "rarityStars",
    "status",
  ];
  const rows = artworks.map((a) =>
    [
      a.code,
      a.tier.slug,
      a.title,
      a.category,
      a.quality,
      a.widthPx,
      a.heightPx,
      a.fileFormat,
      a.series,
      a.character,
      a.rarityStars,
      a.status,
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="artworks-${Date.now()}.csv"`,
    },
  });
}
