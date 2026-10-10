import type { StringSelectMenuInteraction } from "discord.js";
import { tierDetailPayload, productSelectPayload } from "@/bot/panels";
import { showShopPurchaseModal } from "@/bot/interactions/modals";
import { handleBuyCouponSelect, handleQtyCouponSelect, handleCartCouponSelect } from "@/bot/interactions/buttons";
import { handleSellerProductToggleSelect } from "@/bot/sellerPanelHandlers";
import { panelError } from "@/bot/ui";

export async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
  if (interaction.customId === "select:category") {
    const category = interaction.values[0];
    return interaction.update(await productSelectPayload(category));
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

  if (interaction.customId.startsWith("qtycoupon:")) {
    const slug = interaction.customId.slice("qtycoupon:".length);
    return handleQtyCouponSelect(interaction, slug);
  }

  if (interaction.customId === "cartcoupon") {
    return handleCartCouponSelect(interaction);
  }

  if (interaction.customId === "sellerpanel:toggleproduct") {
    return handleSellerProductToggleSelect(interaction);
  }

  if (interaction.customId !== "select:tier") return;

  const slug = interaction.values[0];
  const result = await tierDetailPayload(slug);
  if (!result) {
    return interaction.update(panelError("존재하지 않는 등급입니다."));
  }
  await interaction.update(result.payload);
}
