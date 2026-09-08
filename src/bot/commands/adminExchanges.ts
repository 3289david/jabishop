import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import { approveExchange, rejectExchange, ExchangeError } from "@/lib/exchanges";
import type { BotCommand } from "@/bot/types";

export const exchangeListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("교환목록").setDescription("[관리자] 대기 중인 교환 요청을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const exchanges = await prisma.exchangeRequest.findMany({
      where: { status: "PENDING" },
      include: { user: true, order: { include: { tier: true, artwork: true } } },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    const embed = baseEmbed("🔄 대기 중인 교환 요청");
    if (exchanges.length === 0) embed.setDescription("대기 중인 요청이 없습니다.");
    for (const ex of exchanges) {
      embed.addFields({
        name: `#${ex.order.orderNo} · ${ex.order.tier.name}${ex.order.artwork ? ` · ${ex.order.artwork.code}` : ""}`,
        value: `회원: ${ex.user.name} · 사유: ${ex.reason} · ID: \`${ex.id}\``,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const exchangeApproveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("교환승인")
    .setDescription("[관리자] 교환 요청을 승인합니다 (즉시 다른 재고로 교환됨).")
    .addStringOption((o) => o.setName("교환id").setDescription("/교환목록에서 확인한 ID").setRequired(true)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("교환id", true);
    let result;
    try {
      result = await approveExchange(id, admin.id);
    } catch (e) {
      return interaction.reply({
        embeds: [errorEmbed(e instanceof ExchangeError ? e.message : "처리 중 오류가 발생했습니다.")],
        ephemeral: true,
      });
    }
    await prisma.adminActivityLog.create({
      data: { adminId: admin.id, action: "EXCHANGE_APPROVE", target: id, detail: `${result.oldArtwork.code} → ${result.newArtwork.code}` },
    });
    await interaction.reply({
      embeds: [successEmbed(`교환을 승인했습니다. (${result.newArtwork.code}로 재발송됨)`)],
      ephemeral: true,
    });
  },
};

export const exchangeRejectCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("교환거절")
    .setDescription("[관리자] 교환 요청을 거절합니다.")
    .addStringOption((o) => o.setName("교환id").setDescription("/교환목록에서 확인한 ID").setRequired(true))
    .addStringOption((o) => o.setName("사유").setDescription("거절 사유")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("교환id", true);
    const note = interaction.options.getString("사유") ?? undefined;
    try {
      await rejectExchange(id, admin.id, note);
    } catch (e) {
      return interaction.reply({
        embeds: [errorEmbed(e instanceof ExchangeError ? e.message : "처리 중 오류가 발생했습니다.")],
        ephemeral: true,
      });
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "EXCHANGE_REJECT", target: id, detail: note } });
    await interaction.reply({ embeds: [successEmbed("교환 요청을 거절했습니다.")], ephemeral: true });
  },
};
