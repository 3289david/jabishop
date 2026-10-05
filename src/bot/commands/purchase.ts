import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { purchaseTier, purchaseTierBulk, OrderError } from "@/lib/orders";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed, pt } from "@/bot/format";
import { purchaseAutocomplete } from "@/bot/autocomplete";
import { readUploadedFile, isUploadKey } from "@/bot/fileStorage";
import type { BotCommand } from "@/bot/types";

export const purchaseCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("구매")
    .setDescription("등급을 선택해 랜덤 계정을 구매합니다 (포인트 결제).")
    .addStringOption((o) => o.setName("등급").setDescription("구매할 등급").setRequired(true).setAutocomplete(true))
    .addStringOption((o) =>
      o.setName("쿠폰코드").setDescription("사용할 쿠폰 (선택, 입력 시 목록에서 골라주세요)").setRequired(false).setAutocomplete(true)
    )
    .addIntegerOption((o) =>
      o.setName("수량").setDescription("구매할 수량 (기본 1, 최대 50)").setMinValue(1).setMaxValue(50).setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("샵주소").setDescription("[자판기 상품 전용] 원하는 웹사이트 주소 (비워두면 자동)").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("샵이름").setDescription("[자판기 상품 전용] 원하는 샵 이름 (비워두면 자동)").setRequired(false)
    ),
  autocomplete: purchaseAutocomplete,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const slug = interaction.options.getString("등급", true);
    const couponCode = interaction.options.getString("쿠폰코드") ?? undefined;
    const quantity = interaction.options.getInteger("수량") ?? 1;
    const shopSlug = interaction.options.getString("샵주소") ?? undefined;
    const shopName = interaction.options.getString("샵이름") ?? undefined;

    try {
      const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
      const tier = await prisma.tier.findUnique({ where: { slug } });
      if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 등급입니다.");

      if (quantity > 1) {
        const result = await purchaseTierBulk({ userId: user.id, tierId: tier.id, quantity, couponCode });
        const luckyNote =
          result.luckyCouponCount > 0 ? ` 🎉 5% 할인 쿠폰 ${result.luckyCouponCount}장 당첨! 쿠폰함에서 확인하세요.` : "";

        if (result.successCount === 0) {
          await interaction.editReply({ embeds: [errorEmbed(result.lastError ?? "구매 중 오류가 발생했습니다.")] });
          return;
        }

        const embed =
          result.failedCount > 0
            ? errorEmbed(
                `${tier.name} ${result.successCount}개 구매 완료 (총 ${pt(result.totalPaid)}).${luckyNote}\n나머지 ${result.failedCount}개 실패: ${result.lastError}`
              )
            : successEmbed(
                `${tier.name} ${result.successCount}개 구매가 완료되었습니다 (총 ${pt(result.totalPaid)}).${luckyNote}\n계정은 DM 또는 /주문내역에서 확인하세요.`
              );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const order = await purchaseTier({ userId: user.id, tierId: tier.id, couponCode, shopSlug, shopName });
      const artwork = order.artwork;

      const embed = successEmbed(`${tier.name} 구매 완료!`)
        .setTitle(`주문 #${order.orderNo}`)
        .addFields(
          { name: "결제 금액", value: pt(order.finalAmount), inline: true },
          { name: "지급된 계정", value: artwork?.title ?? "-", inline: true }
        );
      if (order.discountAmount > 0) {
        embed.addFields({
          name: couponCode ? "🎟️ 쿠폰 적용" : "💸 할인 적용",
          value: `-${pt(order.discountAmount)} 할인`,
          inline: true,
        });
      }
      if (order.luckyCoupon) {
        embed.addFields({ name: "🎉 구매 축하 쿠폰 당첨!", value: `5% 할인 쿠폰 \`${order.luckyCoupon.code}\`이 지급되었습니다.` });
      }
      if (order.referralReward) {
        embed.addFields({ name: "🎁 친구 초대 보상", value: `첫 구매 보상 +${pt(order.referralReward.refereeReward)}가 지급되었습니다.` });
      }

      const files = [];
      if (artwork) {
        if (!isUploadKey(artwork.fileKey)) {
          embed.addFields({ name: "지급 내용", value: artwork.fileKey });
        } else {
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
      }

      await interaction.editReply({ embeds: [embed], files });
    } catch (e) {
      const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
      await interaction.editReply({ embeds: [errorEmbed(message)] });
    }
  },
};
