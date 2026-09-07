import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, pt } from "@/bot/format";
import { readUploadedFile } from "@/bot/fileStorage";
import { ORDER_STATUS } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

export const orderListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("주문내역").setDescription("최근 주문 내역을 확인합니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { tier: true, artwork: true },
    });

    const embed = baseEmbed("📦 내 주문 내역");
    if (orders.length === 0) embed.setDescription("주문 내역이 없습니다.");
    for (const o of orders) {
      embed.addFields({
        name: `#${o.orderNo} · ${o.tier.name}`,
        value: `${pt(o.finalAmount)} · ${o.status}${o.artwork ? ` · ${o.artwork.title}` : ""}`,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const orderDetailCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("주문상세")
    .setDescription("주문번호로 상세 내역과 계정을 확인합니다.")
    .addStringOption((o) => o.setName("주문번호").setDescription("예: 20260905000001").setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const orderNo = interaction.options.getString("주문번호", true).replace(/^#/, "");
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);

    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: { tier: true, artwork: true },
    });
    if (!order || order.userId !== user.id) {
      return interaction.editReply({ embeds: [errorEmbed("해당 주문을 찾을 수 없습니다.")] });
    }

    const embed = baseEmbed(`주문 #${order.orderNo}`)
      .addFields(
        { name: "상품", value: order.tier.name, inline: true },
        { name: "결제금액", value: pt(order.finalAmount), inline: true },
        { name: "상태", value: order.status, inline: true }
      );

    const files = [];
    if (order.artwork && order.status === ORDER_STATUS.COMPLETED) {
      embed.addFields({ name: "지급된 계정", value: order.artwork.title });
      try {
        const buffer = await readUploadedFile(order.artwork.fileKey);
        const ext = order.artwork.fileKey.split(".").pop() || "png";
        files.push(new AttachmentBuilder(buffer, { name: `${order.artwork.code}.${ext}` }));
        embed.setImage(`attachment://${order.artwork.code}.${ext}`);
      } catch {
        // 파일 없음 - 무시
      }
    }

    await interaction.editReply({ embeds: [embed], files });
  },
};
