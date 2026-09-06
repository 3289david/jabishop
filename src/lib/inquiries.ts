import { prisma } from "@/lib/prisma";
import { notifyAdminsNewPendingItem } from "@/lib/discordNotify";

export async function createInquiry(userId: string, title: string, content: string, images?: string[]) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const inquiry = await prisma.inquiry.create({
    data: { userId, title, content, images: images?.length ? JSON.stringify(images) : null },
  });

  notifyAdminsNewPendingItem("문의", `**${user?.name ?? "회원"}**: ${title}`).catch(() => {});

  return inquiry;
}
