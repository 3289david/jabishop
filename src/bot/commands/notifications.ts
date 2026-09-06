import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { baseEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const notificationsCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("알림").setDescription("최근 알림을 확인하고 읽음 처리합니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const notifications = await prisma.notification.findMany({
      where: { OR: [{ userId: user.id }, { broadcast: true }] },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const embed = baseEmbed("🔔 최근 알림");
    if (notifications.length === 0) embed.setDescription("알림이 없습니다.");
    for (const n of notifications) {
      embed.addFields({ name: `${n.isRead ? "" : "🆕 "}${n.title}`, value: n.message });
    }

    await prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
