import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { pt } from "@/bot/format";
import { buildPanel, panelError, ephemeral } from "@/bot/ui";
import { readUploadedFile, isUploadKey } from "@/bot/fileStorage";
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

    await interaction.reply(
      ephemeral(
        buildPanel({
          title: "📦 내 주문 내역",
          description: orders.length === 0 ? "주문 내역이 없습니다." : undefined,
          fields: orders.map((o) => ({
            name: `#${o.orderNo} · ${o.tier.name}`,
            value: `${pt(o.finalAmount)} · ${o.status}${o.artwork ? ` · ${o.artwork.title}` : ""}`,
          })),
        })
      )
    );
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
      return interaction.editReply(panelError("해당 주문을 찾을 수 없습니다."));
    }

    const fields = [
      { name: "상품", value: order.tier.name },
      { name: "결제금액", value: pt(order.finalAmount) },
      { name: "상태", value: order.status },
    ];

    const files = [];
    let imageUrl: string | undefined;
    if (order.artwork && order.status === ORDER_STATUS.COMPLETED) {
      fields.push({ name: "지급된 계정", value: order.artwork.title });
      if (!isUploadKey(order.artwork.fileKey)) {
        fields.push({ name: "지급 내용", value: order.artwork.fileKey });
      } else {
        try {
          const buffer = await readUploadedFile(order.artwork.fileKey);
          const ext = order.artwork.fileKey.split(".").pop() || "png";
          files.push(new AttachmentBuilder(buffer, { name: `${order.artwork.code}.${ext}` }));
          imageUrl = `attachment://${order.artwork.code}.${ext}`;
        } catch {
          // 파일 없음 - 무시
        }
      }
    }

    await interaction.editReply({ ...buildPanel({ title: `주문 #${order.orderNo}`, fields, imageUrl }), files });
  },
};
