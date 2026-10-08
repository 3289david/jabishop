import type { StringSelectMenuInteraction } from "discord.js";
import { tierDetailPayload, productSelectRow } from "@/bot/panels";
import { showShopPurchaseModal } from "@/bot/interactions/modals";
import { handleBuyCouponSelect } from "@/bot/interactions/buttons";
import { errorEmbed } from "@/bot/format";

export async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
  if (interaction.customId === "select:category") {
    const category = interaction.values[0];
    const { embed, row } = await productSelectRow(category);
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (interaction.customId.startsWith("shopcoupon:")) {
    const slug = interaction.customId.slice("shopcoupon:".length);
    const chosen = interaction.values[0];
    const couponCode = chosen === "__none__" ? "" : chosen;
    return showShopPurchaseModal(interaction, slug, couponCode);
  }

  if (interaction.customId.startsWith("buycoupon:")) {
    const slug = interaction.customId.slice("buycoupon:".length);
    return handleBuyCouponSelect(interaction, slug);
  }

  if (interaction.customId !== "select:tier") return;

  const slug = interaction.values[0];
  const payload = await tierDetailPayload(slug);
  if (!payload) {
    return interaction.update({ embeds: [errorEmbed("존재하지 않는 등급입니다.")], components: [] });
  }
  await interaction.update({ embeds: [payload.embed], components: [payload.row] });
}
