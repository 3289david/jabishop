import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { RaffleEvent, Tier } from "@prisma/client";

const RAFFLE_COLOR_OPEN = 0xffd700;
const RAFFLE_COLOR_DRAWN = 0x22c55e;

type RaffleWithTier = RaffleEvent & { tier: Tier };

export function raffleEventEmbed(raffle: RaffleWithTier, entryCount: number) {
  return new EmbedBuilder()
    .setColor(RAFFLE_COLOR_OPEN)
    .setTitle(`🎉 ${raffle.title}`)
    .setDescription(raffle.description || null)
    .addFields(
      { name: "🎁 상품", value: raffle.tier.name, inline: true },
      { name: "🏆 당첨자 수", value: `${raffle.winnerCount}명`, inline: true },
      { name: "👥 참가자 수", value: `${entryCount}명`, inline: true },
      { name: "참가 조건", value: "이 서버의 서버 태그를 프로필에 착용 중인 분만 참가할 수 있어요." },
      {
        name: "마감",
        value: raffle.closesAt ? `<t:${Math.floor(raffle.closesAt.getTime() / 1000)}:R> 자동 마감` : "관리자가 직접 마감합니다.",
      }
    )
    .setTimestamp();
}

export function raffleEventRow(raffleId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raffle:enter:${raffleId}`)
      .setLabel("🎟️ 참가하기")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

export function raffleDrawnEmbed(
  raffle: { title: string; description: string | null; tier: { name: string } },
  winners: { discordUserId: string; grantFailed: boolean }[],
  entryCount: number
) {
  return new EmbedBuilder()
    .setColor(RAFFLE_COLOR_DRAWN)
    .setTitle(`🎊 ${raffle.title} - 추첨 완료!`)
    .setDescription(raffle.description || null)
    .addFields(
      { name: "🎁 상품", value: raffle.tier.name, inline: true },
      { name: "👥 참가자 수", value: `${entryCount}명`, inline: true },
      {
        name: "🏆 당첨자",
        value:
          winners
            .map((w) => `<@${w.discordUserId}>${w.grantFailed ? " (재고 부족 - 관리자가 수동 지급 예정)" : ""}`)
            .join("\n") || "-",
      }
    )
    .setTimestamp();
}
