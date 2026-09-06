import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { baseEmbed } from "@/bot/format";
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

    const embed = baseEmbed("🎟️ 내 쿠폰함");
    if (userCoupons.length === 0) embed.setDescription("보유한 쿠폰이 없습니다.");
    for (const uc of userCoupons) {
      embed.addFields({
        name: `${uc.coupon.name} (${uc.coupon.code})`,
        value: `${uc.usedAt ? "사용완료" : "사용가능"} · ~${uc.coupon.validTo.toLocaleDateString("ko-KR")}`,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
