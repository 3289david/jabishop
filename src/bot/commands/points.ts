import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed, pt } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const pointsCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("포인트").setDescription("내 포인트 잔액과 최근 내역을 확인합니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const txs = await prisma.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const embed = baseEmbed("💰 내 포인트").setDescription(`보유 포인트: **${pt(user.points)}**`);
    for (const t of txs) {
      embed.addFields({ name: t.memo ?? t.type, value: `${t.amount >= 0 ? "+" : ""}${pt(t.amount)}` });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const topUpCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("포인트충전신청")
    .setDescription("계좌이체 후 포인트 충전을 신청합니다 (관리자 확인 후 지급).")
    .addIntegerOption((o) => o.setName("금액").setDescription("충전할 금액(원)").setRequired(true).setMinValue(1000))
    .addStringOption((o) => o.setName("입금자명").setDescription("실제 입금자명").setRequired(true)),
  async execute(interaction) {
    const amount = interaction.options.getInteger("금액", true);
    const depositorName = interaction.options.getString("입금자명", true);
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);

    const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
    await prisma.pointTopUpRequest.create({ data: { userId: user.id, amount, depositorName } });

    const embed = successEmbed("충전 신청이 접수되었습니다. 입금 확인 후 포인트가 지급됩니다.");
    if (settings) {
      embed.addFields({
        name: "입금 계좌",
        value: `${settings.bankName} ${settings.bankAccountNumber} (예금주: ${settings.bankAccountHolder})`,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
