"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/actions/auth";
import { saveUploadedFile } from "@/lib/storage";
import { createInquiry } from "@/lib/inquiries";

export type ActionState = { error?: string } | undefined;

export async function createInquiryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();
  const image = formData.get("image") as File | null;

  if (!title || !content) return { error: "제목과 내용을 입력해주세요." };

  let images: string[] = [];
  if (image && image.size > 0) {
    const key = await saveUploadedFile(image, "attachments");
    images = [key];
  }

  const inquiry = await createInquiry(user.id, title, content, images);
  redirect(`/mypage/inquiries/${inquiry.id}`);
}
