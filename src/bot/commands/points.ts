import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { pt } from "@/bot/format";
import { buildPanel, ephemeral } from "@/bot/ui";
import { createTopUpRequest } from "@/lib/points";
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
    await interaction.reply(
      ephemeral(
        buildPanel({
          title: "💰 내 포인트",
          description: `보유 포인트: **${pt(user.points)}**`,
          fields: txs.map((t) => ({ name: t.memo ?? t.type, value: `${t.amount >= 0 ? "+" : ""}${pt(t.amount)}` })),
        })
      )
    );
  },
};

export const topUpCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("포인트충전신청")
    .setDescription("계좌이체 후 포인트 충전을 신청합니다 (관리자 확인 후 지급).")
    .addIntegerOption((o) => o.setName("금액").setDescription("충전할 금액(원)").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("입금자명").setDescription("실제 입금자명").setRequired(true)),
  async execute(interaction) {
    const amount = interaction.options.getInteger("금액", true);
    const depositorName = interaction.options.getString("입금자명", true);
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);

    const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
    await createTopUpRequest(user.id, amount, depositorName);

    await interaction.reply(
      ephemeral(
        buildPanel({
          title: "✅ 완료",
          description: "충전 신청이 접수되었습니다. 입금 확인 후 포인트가 지급됩니다.",
          fields: settings
            ? [{ name: "입금 계좌", value: `${settings.bankName} ${settings.bankAccountNumber} (예금주: ${settings.bankAccountHolder})` }]
            : undefined,
          accentColor: 0x22c55e,
        })
      )
    );
  },
};
