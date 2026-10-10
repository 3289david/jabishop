import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { buildPanel, ephemeral } from "@/bot/ui";
import type { BotCommand } from "@/bot/types";

export const couponListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("쿠폰함").setDescription("내가 보유한 쿠폰을 확인합니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const userCoupons = await prisma.userCoupon.findMany({
      where: { userId: user.id },
      include: { coupon: true },
      orderBy: { issuedAt: "desc" },
    });

    await interaction.reply(
      ephemeral(
        buildPanel({
          title: "🎟️ 내 쿠폰함",
          description: userCoupons.length === 0 ? "보유한 쿠폰이 없습니다." : undefined,
          fields: userCoupons.map((uc) => ({
            name: `${uc.coupon.name} (${uc.coupon.code})`,
            value: `${uc.usedAt ? "사용완료" : "사용가능"} · ~${uc.coupon.validTo.toLocaleDateString("ko-KR")}`,
          })),
        })
      )
    );
  },
};
