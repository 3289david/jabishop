import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { ORDER_STATUS } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

export const reviewCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("리뷰작성")
    .setDescription("구매한 주문에 리뷰를 작성합니다.")
    .addStringOption((o) => o.setName("주문번호").setDescription("예: 20260905000001").setRequired(true))
    .addIntegerOption((o) => o.setName("별점").setDescription("1~5").setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption((o) => o.setName("내용").setDescription("리뷰 내용").setRequired(true).setMaxLength(1000)),
  async execute(interaction) {
    const orderNo = interaction.options.getString("주문번호", true).replace(/^#/, "");
    const rating = interaction.options.getInteger("별점", true);
    const content = interaction.options.getString("내용", true);
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);

    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.userId !== user.id) {
      return interaction.reply({ embeds: [errorEmbed("해당 주문을 찾을 수 없습니다.")], ephemeral: true });
    }
    if (order.status !== ORDER_STATUS.COMPLETED) {
      return interaction.reply({ embeds: [errorEmbed("구매가 완료된 주문만 리뷰를 작성할 수 있습니다.")], ephemeral: true });
    }
    const existing = await prisma.review.findUnique({ where: { orderId: order.id } });
    if (existing) {
      return interaction.reply({ embeds: [errorEmbed("이미 리뷰를 작성한 주문입니다.")], ephemeral: true });
    }

    await prisma.review.create({ data: { userId: user.id, orderId: order.id, rating, content, purchaseVerified: true } });
    await interaction.reply({ embeds: [successEmbed("리뷰가 등록되었습니다.")], ephemeral: true });
  },
};
