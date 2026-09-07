import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { purchaseTier, OrderError } from "@/lib/orders";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed, pt } from "@/bot/format";
import { tierAutocomplete } from "@/bot/autocomplete";
import { readUploadedFile } from "@/bot/fileStorage";
import type { BotCommand } from "@/bot/types";

export const purchaseCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("구매")
    .setDescription("등급을 선택해 랜덤 계정을 구매합니다 (포인트 결제).")
    .addStringOption((o) => o.setName("등급").setDescription("구매할 등급").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("쿠폰코드").setDescription("적용할 쿠폰 코드 (선택)").setRequired(false)),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const slug = interaction.options.getString("등급", true);
    const couponCode = interaction.options.getString("쿠폰코드") ?? undefined;

    try {
      const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
      const tier = await prisma.tier.findUnique({ where: { slug } });
      if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 등급입니다.");

      const order = await purchaseTier({ userId: user.id, tierId: tier.id, couponCode });
      const artwork = order.artwork;

      const embed = successEmbed(`${tier.name} 구매 완료!`)
        .setTitle(`주문 #${order.orderNo}`)
        .addFields(
          { name: "결제 금액", value: pt(order.finalAmount), inline: true },
          { name: "지급된 계정", value: artwork?.title ?? "-", inline: true }
        );

      const files = [];
      if (artwork) {
        try {
          const buffer = await readUploadedFile(artwork.fileKey);
          const ext = artwork.fileKey.split(".").pop() || "png";
          const attachment = new AttachmentBuilder(buffer, { name: `${artwork.code}.${ext}` });
          files.push(attachment);
          embed.setImage(`attachment://${artwork.code}.${ext}`);
        } catch {
          // 파일을 찾을 수 없어도 주문 자체는 정상 처리된 것이므로 안내만 생략한다.
        }
      }

      await interaction.editReply({ embeds: [embed], files });
    } catch (e) {
      const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
      await interaction.editReply({ embeds: [errorEmbed(message)] });
    }
  },
};
