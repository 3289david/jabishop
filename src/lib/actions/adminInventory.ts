"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { ARTWORK_STATUS } from "@/lib/constants";

export type ActionState = { error?: string } | undefined;

export async function createArtworkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const tierId = String(formData.get("tierId") || "");
  const code = String(formData.get("code") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const quality = String(formData.get("quality") || "").trim() || null;
  const widthPx = formData.get("widthPx") ? Number(formData.get("widthPx")) : null;
  const heightPx = formData.get("heightPx") ? Number(formData.get("heightPx")) : null;
  const series = String(formData.get("series") || "").trim() || null;
  const character = String(formData.get("character") || "").trim() || null;
  const madeYear = formData.get("madeYear") ? Number(formData.get("madeYear")) : null;
  const rarityStars = Number(formData.get("rarityStars") || 1);
  const limitedEdition = formData.get("limitedEdition") === "on";
  const file = formData.get("file") as File | null;
  const previewFile = formData.get("previewFile") as File | null;

  if (!tierId || !code || !title || !category) return { error: "필수 항목을 입력해주세요." };
  if (!file || file.size === 0) return { error: "그림 원본 파일을 업로드해주세요." };

  const existingCode = await prisma.artwork.findUnique({ where: { code } });
  if (existingCode) return { error: "이미 사용 중인 재고 코드입니다." };

  const fileKey = await saveUploadedFile(file, "artworks");
  const previewKey = previewFile && previewFile.size > 0 ? await saveUploadedFile(previewFile, "previews") : fileKey;
  const fileFormat = file.name.split(".").pop()?.toUpperCase() || null;

  const artwork = await prisma.artwork.create({
    data: {
      tierId,
      code,
      title,
      category,
      quality,
      widthPx,
      heightPx,
      fileFormat,
      series,
      character,
      madeYear,
      rarityStars,
      limitedEdition,
      fileKey,
      previewKey,
    },
  });
  await logAdminActivity(admin.id, "ARTWORK_CREATE", artwork.id, `${code} / ${title}`);
  revalidatePath("/admin/inventory");
  redirect("/admin/inventory");
}

export async function updateArtworkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const quality = String(formData.get("quality") || "").trim() || null;
  const status = String(formData.get("status") || "AVAILABLE");
  const rarityStars = Number(formData.get("rarityStars") || 1);
  const limitedEdition = formData.get("limitedEdition") === "on";
  const file = formData.get("file") as File | null;
  const previewFile = formData.get("previewFile") as File | null;

  if (!title || !category) return { error: "필수 항목을 입력해주세요." };

  const current = await prisma.artwork.findUnique({ where: { id } });
  if (!current) return { error: "존재하지 않는 재고입니다." };

  let fileKey = current.fileKey;
  let previewKey = current.previewKey;
  if (file && file.size > 0) {
    if (fileKey) await deleteUploadedFile(fileKey);
    fileKey = await saveUploadedFile(file, "artworks");
  }
  if (previewFile && previewFile.size > 0) {
    if (previewKey && previewKey !== current.fileKey) await deleteUploadedFile(previewKey);
    previewKey = await saveUploadedFile(previewFile, "previews");
  }

  if (status === "AVAILABLE" && !fileKey) {
    return { error: "판매가능 상태로 전환하려면 먼저 그림 파일을 업로드해야 합니다." };
  }

  await prisma.artwork.update({
    where: { id },
    data: { title, category, quality, status, rarityStars, limitedEdition, fileKey, previewKey },
  });
  await logAdminActivity(admin.id, "ARTWORK_UPDATE", id, `${title} / ${status}`);
  revalidatePath("/admin/inventory");
  redirect("/admin/inventory");
}

export async function deleteArtworkAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const artwork = await prisma.artwork.findUnique({ where: { id } });
  if (!artwork) return;
  if (artwork.status === ARTWORK_STATUS.SOLD || artwork.status === ARTWORK_STATUS.RESERVED) {
    // 이미 판매/예약된 재고는 실수 삭제를 막기 위해 숨김 처리만 한다.
    await prisma.artwork.update({ where: { id }, data: { status: ARTWORK_STATUS.HIDDEN } });
    await logAdminActivity(admin.id, "ARTWORK_HIDE", id, "판매/예약 상태라 숨김 처리");
  } else {
    await deleteUploadedFile(artwork.fileKey);
    if (artwork.previewKey && artwork.previewKey !== artwork.fileKey) {
      await deleteUploadedFile(artwork.previewKey);
    }
    await prisma.artwork.delete({ where: { id } });
    await logAdminActivity(admin.id, "ARTWORK_DELETE", id, artwork.code);
  }
  revalidatePath("/admin/inventory");
}

export async function bulkMarkSoldOutAction(formData: FormData) {
  const admin = await requireAdmin();
  const tierId = String(formData.get("tierId") || "");
  await prisma.tier.update({ where: { id: tierId }, data: { status: "SOLD_OUT" } });
  await logAdminActivity(admin.id, "TIER_SOLD_OUT", tierId);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
}

export async function importArtworksCsvAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const file = formData.get("csv") as File | null;
  if (!file || file.size === 0) return { error: "CSV 파일을 선택해주세요." };

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { error: "CSV에 데이터 행이 없습니다." };

  const header = lines[0].split(",").map((h) => h.trim());
  const required = ["code", "tierSlug", "title", "category"];
  for (const col of required) {
    if (!header.includes(col)) return { error: `CSV 헤더에 ${col} 컬럼이 필요합니다.` };
  }

  const tiers = await prisma.tier.findMany();
  const tierBySlug = new Map(tiers.map((t) => [t.slug, t.id]));

  let created = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, idx) => (row[h] = cols[idx] ?? ""));

    const tierId = tierBySlug.get(row.tierSlug);
    if (!tierId) {
      errors.push(`${i + 1}행: 알 수 없는 등급 slug (${row.tierSlug})`);
      continue;
    }
    if (!row.code || !row.title) {
      errors.push(`${i + 1}행: code/title 누락`);
      continue;
    }
    const exists = await prisma.artwork.findUnique({ where: { code: row.code } });
    if (exists) {
      errors.push(`${i + 1}행: 중복 코드 (${row.code})`);
      continue;
    }

    await prisma.artwork.create({
      data: {
        code: row.code,
        tierId,
        title: row.title,
        category: row.category || "기타",
        quality: row.quality || null,
        widthPx: row.widthPx ? Number(row.widthPx) : null,
        heightPx: row.heightPx ? Number(row.heightPx) : null,
        fileFormat: row.fileFormat || null,
        series: row.series || null,
        character: row.character || null,
        rarityStars: row.rarityStars ? Number(row.rarityStars) : 1,
        // CSV 일괄 등록은 상품 데이터만 선등록하고, 실제 파일은 관리자가 개별 수정 화면에서
        // 업로드해야 판매 가능 상태(AVAILABLE)로 전환되도록 HIDDEN으로 시작한다.
        fileKey: "",
        status: "HIDDEN",
      },
    });
    created++;
  }

  await logAdminActivity(admin.id, "ARTWORK_CSV_IMPORT", undefined, `${created}건 등록, 오류 ${errors.length}건`);
  revalidatePath("/admin/inventory");
  if (errors.length > 0) {
    return { error: `${created}건 등록 완료. 오류 ${errors.length}건: ${errors.slice(0, 5).join("; ")}` };
  }
  return undefined;
}
