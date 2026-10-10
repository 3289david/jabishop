import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { won } from "@/bot/format";
import { buildPanel, panelSuccess, ephemeral } from "@/bot/ui";
import { getTopSpenders } from "@/lib/leaderboard";
import type { BotCommand } from "@/bot/types";

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}.`;
}

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("리더보드").setDescription("누적 구매 금액 TOP 10을 봅니다."),
  async execute(interaction) {
    const top = await getTopSpenders(10);
    // 리더보드는 채널에 공개로 보여주는 게 의도라 ephemeral을 쓰지 않는다 (기존 동작 유지).
    await interaction.reply(
      buildPanel({
        title: "🏆 누적구매 리더보드",
        description: top.length === 0 ? "아직 집계된 구매 내역이 없습니다." : undefined,
        fields: top.map((entry) => ({
          name: `${medal(entry.rank)} ${entry.user.leaderboardAnonymous ? "익명의 구매자" : entry.user.name}`,
          value: won(entry.totalSpend),
        })),
      })
    );
  },
};

export const leaderboardPrivacyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("리더보드공개설정")
    .setDescription("리더보드에서 내 이름을 공개할지 설정합니다.")
    .addBooleanOption((o) =>
      o.setName("익명").setDescription("켜면 리더보드에 이름 대신 '익명의 구매자'로 표시됩니다").setRequired(true)
    ),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const anonymous = interaction.options.getBoolean("익명", true);
    await prisma.user.update({ where: { id: user.id }, data: { leaderboardAnonymous: anonymous } });
    await interaction.reply(
      ephemeral(panelSuccess(anonymous ? "리더보드에서 익명으로 표시됩니다." : "리더보드에 이름이 공개됩니다."))
    );
  },
};
