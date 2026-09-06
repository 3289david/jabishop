import type { StringSelectMenuInteraction } from "discord.js";
import { tierDetailPayload } from "@/bot/panels";
import { errorEmbed } from "@/bot/format";

export async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
  if (interaction.customId !== "select:tier") return;

  const slug = interaction.values[0];
  const payload = await tierDetailPayload(slug);
  if (!payload) {
    return interaction.update({ embeds: [errorEmbed("존재하지 않는 등급입니다.")], components: [] });
  }
  await interaction.update({ embeds: [payload.embed], components: [payload.row] });
}
