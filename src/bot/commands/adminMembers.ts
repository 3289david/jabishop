import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin, getOrCreateShopUser } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed, pt } from "@/bot/format";
import { adjustPoints, TopUpError } from "@/lib/points";
import type { BotCommand } from "@/bot/types";

export const memberViewCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("회원조회")
    .setDescription("[관리자] 디스코드 사용자의 쇼핑몰 회원 정보를 봅니다.")
    .addUserOption((o) => o.setName("대상").setDescription("조회할 디스코드 사용자").setRequired(true)),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const target = interaction.options.getUser("대상", true);
    const user = await prisma.user.findUnique({ where: { discordId: target.id }, include: { _count: { select: { orders: true } } } });
    if (!user) return interaction.reply({ embeds: [errorEmbed("아직 봇을 사용한 적 없는 사용자입니다.")], ephemeral: true });

    const embed = baseEmbed(`${user.name} 회원 정보`).addFields(
      { name: "이메일", value: user.email, inline: true },
      { name: "상태", value: user.status, inline: true },
      { name: "포인트", value: pt(user.points), inline: true },
      { name: "주문 수", value: `${user._count.orders}건`, inline: true }
    );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const memberStatusCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("회원상태변경")
    .setDescription("[관리자] 회원의 계정 상태를 변경합니다.")
    .addUserOption((o) => o.setName("대상").setDescription("대상 디스코드 사용자").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("상태")
        .setDescription("변경할 상태")
        .setRequired(true)
        .addChoices({ name: "정상", value: "ACTIVE" }, { name: "이용정지", value: "SUSPENDED" }, { name: "탈퇴", value: "WITHDRAWN" })
    )
    .addStringOption((o) => o.setName("사유").setDescription("정지 사유 (선택)")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const target = interaction.options.getUser("대상", true);
    const status = interaction.options.getString("상태", true);
    const reason = interaction.options.getString("사유");

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });
    if (!user) return interaction.reply({ embeds: [errorEmbed("아직 봇을 사용한 적 없는 사용자입니다.")], ephemeral: true });

    await prisma.user.update({ where: { id: user.id }, data: { status, suspendedReason: reason } });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "MEMBER_STATUS_UPDATE", target: user.id, detail: status } });
    await interaction.reply({ embeds: [successEmbed(`${user.name}님의 상태를 ${status}로 변경했습니다.`)], ephemeral: true });
  },
};

export const memberPointAdjustCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("포인트조정")
    .setDescription("[관리자] 회원의 포인트를 직접 증감시킵니다.")
    .addUserOption((o) => o.setName("대상").setDescription("대상 디스코드 사용자").setRequired(true))
    .addIntegerOption((o) => o.setName("금액").setDescription("증감 포인트 (음수 가능)").setRequired(true))
    .addStringOption((o) => o.setName("사유").setDescription("조정 사유").setRequired(true)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const target = interaction.options.getUser("대상", true);
    const amount = interaction.options.getInteger("금액", true);
    const memo = interaction.options.getString("사유", true);

    const user = await getOrCreateShopUser(target.id, target.tag);
    try {
      await adjustPoints(user.id, amount, memo);
    } catch (e) {
      return interaction.reply({
        embeds: [errorEmbed(e instanceof TopUpError ? e.message : "처리 중 오류가 발생했습니다.")],
        ephemeral: true,
      });
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "POINT_ADMIN_ADJUST", target: user.id, detail: `${amount}P: ${memo}` } });
    await interaction.reply({ embeds: [successEmbed(`${target.username}님의 포인트를 ${amount >= 0 ? "+" : ""}${amount}P 조정했습니다.`)], ephemeral: true });
  },
};
