"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/actions/adminAuth";
import { logAdminActivity } from "@/lib/actions/adminSecurity";
import { purgeSeedData } from "@/lib/adminMaintenance";

export type ActionState = { error?: string; success?: string } | undefined;

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  const shopName = String(formData.get("shopName") || "자비샵").trim();
  const bankName = String(formData.get("bankName") || "").trim();
  const bankAccountNumber = String(formData.get("bankAccountNumber") || "").trim();
  const bankAccountHolder = String(formData.get("bankAccountHolder") || "").trim();
  const refundAllowedAfterDownload = formData.get("refundAllowedAfterDownload") === "on";
  const noticeMessage = String(formData.get("noticeMessage") || "").trim() || null;

  const discordFields = [
    "discordPurchaseLogChannelId",
    "discordMemberCountChannelId",
    "discordBuyerCountChannelId",
    "discordAutoDeleteChannelId",
    "discordRoleTier150k",
    "discordRoleTier100k",
    "discordRoleTier50k",
    "discordRoleTier10k",
    "discordRoleBuyer",
  ] as const;
  const discordData = Object.fromEntries(
    discordFields.map((key) => [key, String(formData.get(key) || "").trim() || null])
  );

  await prisma.shopSetting.upsert({
    where: { id: "singleton" },
    update: { shopName, bankName, bankAccountNumber, bankAccountHolder, refundAllowedAfterDownload, noticeMessage, ...discordData },
    create: {
      id: "singleton",
      shopName,
      bankName,
      bankAccountNumber,
      bankAccountHolder,
      refundAllowedAfterDownload,
      noticeMessage,
      ...discordData,
    },
  });
  await logAdminActivity(admin.id, "SETTINGS_UPDATE");
  revalidatePath("/admin/settings");
  return { success: "설정이 저장되었습니다." };
}

export async function purgeSeedDataAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  const confirm = String(formData.get("confirm") || "");
  if (confirm !== "삭제") {
    return { error: '확인 문구가 일치하지 않습니다. "삭제" 라고 정확히 입력해주세요.' };
  }

  const result = await purgeSeedData();
  await logAdminActivity(
    admin.id,
    "PURGE_SEED_DATA",
    undefined,
    `회원 ${result.deletedUsers}명, 주문 ${result.deletedOrders}건, 계정 ${result.deletedArtworks}개 삭제`
  );
  revalidatePath("/", "layout");
  return {
    success: `데모 데이터 삭제 완료: 회원 ${result.deletedUsers}명, 주문 ${result.deletedOrders}건, 계정 ${result.deletedArtworks}개`,
  };
}
