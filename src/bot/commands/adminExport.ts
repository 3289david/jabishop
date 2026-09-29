import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin, requireSuperRole } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const salesExportCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("매출내보내기")
    .setDescription("[관리자/SUPER] 기간별 매출/주문 내역을 CSV로 내보냅니다.")
    .addStringOption((o) => o.setName("시작일").setDescription("YYYY-MM-DD (비우면 전체 기간)"))
    .addStringOption((o) => o.setName("종료일").setDescription("YYYY-MM-DD (비우면 오늘까지)")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    requireSuperRole(admin.role);
    await interaction.deferReply({ ephemeral: true });

    const startStr = interaction.options.getString("시작일");
    const endStr = interaction.options.getString("종료일");

    const start = startStr ? new Date(startStr) : undefined;
    const end = endStr ? new Date(new Date(endStr).getTime() + 24 * 60 * 60 * 1000) : undefined;
    if (startStr && (!start || isNaN(start.getTime()))) {
      return interaction.editReply({ embeds: [errorEmbed("시작일 형식이 올바르지 않습니다 (YYYY-MM-DD).")] });
    }
    if (endStr && (!end || isNaN(end.getTime()))) {
      return interaction.editReply({ embeds: [errorEmbed("종료일 형식이 올바르지 않습니다 (YYYY-MM-DD).")] });
    }

    const orders = await prisma.order.findMany({
      where: start || end ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } } : undefined,
      include: { user: true, tier: true, coupon: true },
      orderBy: { createdAt: "asc" },
    });

    if (orders.length === 0) {
      return interaction.editReply({ embeds: [errorEmbed("해당 기간에 주문 내역이 없습니다.")] });
    }

    const header = ["주문번호", "날짜", "회원명", "디스코드ID", "등급명", "정가", "할인액", "결제금액", "쿠폰코드", "상태"];
    const rows = orders.map((o) =>
      [
        o.orderNo,
        o.createdAt.toISOString(),
        o.user?.name ?? "-",
        o.user?.discordId ?? "-",
        o.tier.name,
        o.priceAtPurchase,
        o.discountAmount,
        o.finalAmount,
        o.coupon?.code ?? "-",
        o.status,
      ]
        .map(csvEscape)
        .join(",")
    );
    // 앞에 BOM을 붙여 엑셀에서 한글이 깨지지 않게 한다.
    const csv = "﻿" + [header.join(","), ...rows].join("\n");

    const file = new AttachmentBuilder(Buffer.from(csv, "utf-8"), { name: `sales-${Date.now()}.csv` });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SALES_EXPORT", detail: `${orders.length}건` } });
    await interaction.editReply({ embeds: [successEmbed(`${orders.length}건의 주문 내역을 내보냈습니다.`)], files: [file] });
  },
};
