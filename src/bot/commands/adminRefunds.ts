import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { buildPanel, panelError, panelSuccess, ephemeral } from "@/bot/ui";
import { approveRefund, rejectRefund, RefundError } from "@/lib/refunds";
import type { BotCommand } from "@/bot/types";

// 전역 슬래시 커맨드 100개 한도 때문에 목록/승인/거절 3개로 나뉘어 있던 커맨드를
// 서브커맨드 하나로 합쳤다 (다른 관리 기능들은 이미 이 패턴을 쓰고 있다, 예: /판매자신청).
export const refundManageCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("환불관리")
    .setDescription("[관리자] 환불 요청을 조회/승인/거절합니다.")
    .addSubcommand((sc) => sc.setName("목록").setDescription("대기 중인 환불 요청을 봅니다."))
    .addSubcommand((sc) =>
      sc
        .setName("승인")
        .setDescription("환불 요청을 승인합니다.")
        .addStringOption((o) => o.setName("환불id").setDescription("/환불관리 목록에서 확인한 ID").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("거절")
        .setDescription("환불 요청을 거절합니다.")
        .addStringOption((o) => o.setName("환불id").setDescription("/환불관리 목록에서 확인한 ID").setRequired(true))
        .addStringOption((o) => o.setName("사유").setDescription("거절 사유"))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "목록") {
      await requireLinkedAdmin(interaction.user.id);
      const refunds = await prisma.refundRequest.findMany({
        where: { status: "PENDING" },
        include: { user: true, order: { include: { tier: true } } },
        orderBy: { createdAt: "asc" },
        take: 25,
      });
      return interaction.reply(
        ephemeral(
          buildPanel({
            title: "💰 대기 중인 환불 요청",
            description: refunds.length === 0 ? "대기 중인 요청이 없습니다." : undefined,
            fields: refunds.map((r) => ({
              name: `#${r.order.orderNo} · ${r.order.tier.name} · ${r.order.finalAmount.toLocaleString()}P`,
              value: `회원: ${r.user.name} · 사유: ${r.reason} · ID: \`${r.id}\``,
            })),
          })
        )
      );
    }

    if (sub === "승인") {
      const admin = await requireLinkedAdmin(interaction.user.id);
      const id = interaction.options.getString("환불id", true);
      try {
        await approveRefund(id, admin.id);
      } catch (e) {
        return interaction.reply(ephemeral(panelError(e instanceof RefundError ? e.message : "처리 중 오류가 발생했습니다.")));
      }
      await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "REFUND_APPROVE", target: id } });
      return interaction.reply(ephemeral(panelSuccess("환불을 승인했습니다.")));
    }

    // 거절
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("환불id", true);
    const note = interaction.options.getString("사유") ?? undefined;
    try {
      await rejectRefund(id, admin.id, note);
    } catch (e) {
      return interaction.reply(ephemeral(panelError(e instanceof RefundError ? e.message : "처리 중 오류가 발생했습니다.")));
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "REFUND_REJECT", target: id, detail: note } });
    return interaction.reply(ephemeral(panelSuccess("환불 요청을 거절했습니다.")));
  },
};
