"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { saveUploadedFile, deleteUploadedFile, isUploadKey } from "@/lib/storage";
import { ARTWORK_STATUS } from "@/lib/constants";

export type ActionState = { error?: string } | undefined;

export async function createArtworkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const tierId = String(formData.get("tierId") || "");
  const code = String(formData.get("code") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const file = formData.get("file") as File | null;
  const previewText = String(formData.get("previewText") || "").trim();

  if (!tierId || !code || !title) return { error: "필수 항목을 입력해주세요." };
  if (!file || file.size === 0) return { error: "계정 원본 파일을 업로드해주세요." };

  const existingCode = await prisma.artwork.findUnique({ where: { code } });
  if (existingCode) return { error: "이미 사용 중인 재고 코드입니다." };

  const fileKey = await saveUploadedFile(file, "artworks");
  const previewKey = previewText || fileKey;

  const artwork = await prisma.artwork.create({
    data: { tierId, code, title, fileKey, previewKey },
  });
  await logAdminActivity(admin.id, "ARTWORK_CREATE", artwork.id, `${code} / ${title}`);
  revalidatePath("/admin/inventory");
  redirect("/admin/inventory");
}

export async function updateArtworkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const status = String(formData.get("status") || "AVAILABLE");
  const file = formData.get("file") as File | null;
  const previewText = String(formData.get("previewText") || "").trim();

  if (!title) return { error: "필수 항목을 입력해주세요." };

  const current = await prisma.artwork.findUnique({ where: { id } });
  if (!current) return { error: "존재하지 않는 재고입니다." };

  let fileKey = current.fileKey;
  let previewKey = current.previewKey;
  if (file && file.size > 0) {
    if (fileKey && isUploadKey(fileKey)) await deleteUploadedFile(fileKey);
    fileKey = await saveUploadedFile(file, "artworks");
  }
  if (previewText) {
    if (previewKey && previewKey !== current.fileKey && isUploadKey(previewKey)) await deleteUploadedFile(previewKey);
    previewKey = previewText;
  }

  if (status === "AVAILABLE" && !fileKey) {
    return { error: "판매가능 상태로 전환하려면 먼저 계정 파일을 업로드해야 합니다." };
  }

  await prisma.artwork.update({
    where: { id },
    data: { title, status, fileKey, previewKey },
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
    if (isUploadKey(artwork.fileKey)) await deleteUploadedFile(artwork.fileKey);
    if (artwork.previewKey && artwork.previewKey !== artwork.fileKey && isUploadKey(artwork.previewKey)) {
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

// 한 줄 = 재고 1개. 그 줄 내용(링크 또는 텍스트)이 구매 즉시 지급되는 콘텐츠(fileKey)가
// 되므로, 파일 업로드 없이 바로 판매가능 상태로 등록된다.
export async function importArtworksTxtAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const tierId = String(formData.get("tierId") || "");
  const file = formData.get("txt") as File | null;

  if (!tierId) return { error: "등급을 선택해주세요." };
  if (!file || file.size === 0) return { error: "TXT 파일을 선택해주세요." };

  const tier = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!tier) return { error: "존재하지 않는 등급입니다." };

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { error: "파일에 등록할 줄이 없습니다." };

  let created = 0;
  for (const line of lines) {
    created++;
    await prisma.artwork.create({
      data: {
        tierId,
        code: `${tier.slug}-${randomUUID().slice(0, 8)}`,
        title: `${tier.name} #${created}`,
        fileKey: line,
        status: "AVAILABLE",
      },
    });
  }

  await logAdminActivity(admin.id, "ARTWORK_TXT_IMPORT", tierId, `${tier.name} ${created}건 등록`);
  revalidatePath("/admin/inventory");
  return undefined;
}
