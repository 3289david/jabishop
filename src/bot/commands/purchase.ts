import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { purchaseTier, purchaseTierBulk, OrderError } from "@/lib/orders";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { pt } from "@/bot/format";
import { buildPanel, panelError } from "@/bot/ui";
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
        const result = await purchaseTierBulk({ userId: user.id, tierId: tier.id, quantity, couponCode, guildId: interaction.guildId });
        const luckyNote =
          result.luckyCouponCount > 0 ? ` 🎉 5% 할인 쿠폰 ${result.luckyCouponCount}장 당첨! 쿠폰함에서 확인하세요.` : "";

        if (result.successCount === 0) {
          await interaction.editReply(panelError(result.lastError ?? "구매 중 오류가 발생했습니다."));
          return;
        }

        const payload =
          result.failedCount > 0
            ? buildPanel({
                title: "⚠️ 일부 구매 완료",
                description: `${tier.name} ${result.successCount}개 구매 완료 (총 ${pt(result.totalPaid)}).${luckyNote}\n나머지 ${result.failedCount}개 실패: ${result.lastError}`,
                accentColor: 0xf59e0b,
              })
            : buildPanel({
                title: "✅ 구매 완료",
                description: `${tier.name} ${result.successCount}개 구매가 완료되었습니다 (총 ${pt(result.totalPaid)}).${luckyNote}\n계정은 DM 또는 /주문내역에서 확인하세요.`,
                accentColor: 0x22c55e,
              });
        await interaction.editReply(payload);
        return;
      }

      const order = await purchaseTier({ userId: user.id, tierId: tier.id, couponCode, shopSlug, shopName, guildId: interaction.guildId });
      const artwork = order.artwork;

      const fields = [
        { name: "결제 금액", value: pt(order.finalAmount) },
        { name: "지급된 계정", value: artwork?.title ?? "-" },
      ];
      if (order.discountAmount > 0) {
        fields.push({ name: couponCode ? "🎟️ 쿠폰 적용" : "💸 할인 적용", value: `-${pt(order.discountAmount)} 할인` });
      }
      if (order.luckyCoupon) {
        fields.push({ name: "🎉 구매 축하 쿠폰 당첨!", value: `5% 할인 쿠폰 \`${order.luckyCoupon.code}\`이 지급되었습니다.` });
      }
      if (order.referralReward) {
        fields.push({ name: "🎁 친구 초대 보상", value: `첫 구매 보상 +${pt(order.referralReward.refereeReward)}가 지급되었습니다.` });
      }
      if (order.bonusOrder?.artwork) {
        fields.push({ name: "🎁 1+1 이벤트 보너스!", value: `"${order.bonusOrder.artwork.title}" 계정을 하나 더 받았습니다 (DM으로도 전달됨).` });
      }

      const files = [];
      let imageUrl: string | undefined;
      if (artwork) {
        if (!isUploadKey(artwork.fileKey)) {
          fields.push({ name: "지급 내용", value: artwork.fileKey });
        } else {
          try {
            const buffer = await readUploadedFile(artwork.fileKey);
            const ext = artwork.fileKey.split(".").pop() || "png";
            files.push(new AttachmentBuilder(buffer, { name: `${artwork.code}.${ext}` }));
            imageUrl = `attachment://${artwork.code}.${ext}`;
          } catch {
            // 파일을 찾을 수 없어도 주문 자체는 정상 처리된 것이므로 안내만 생략한다.
          }
        }
      }

      await interaction.editReply({
        ...buildPanel({ title: `✅ ${tier.name} 구매 완료! (주문 #${order.orderNo})`, fields, imageUrl, accentColor: 0x22c55e }),
        files,
      });
    } catch (e) {
      const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
      await interaction.editReply(panelError(message));
    }
  },
};
