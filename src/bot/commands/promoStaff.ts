import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { computePromoStaffStats, registerPromoStaffBank, PromoStaffError } from "@/lib/promoStaff";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const promoStaffCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("홍보실적")
    .setDescription("[홍보직원] 내 초대 실적을 확인하고 정산받을 계좌를 등록합니다.")
    .addSubcommand((sc) => sc.setName("보기").setDescription("내 초대 인원/정산 예정액을 확인합니다."))
    .addSubcommand((sc) =>
      sc
        .setName("계좌등록")
        .setDescription("정산받을 계좌 정보를 등록/수정합니다.")
        .addStringOption((o) => o.setName("은행").setDescription("은행명").setRequired(true))
        .addStringOption((o) => o.setName("계좌번호").setDescription("계좌번호").setRequired(true))
        .addStringOption((o) => o.setName("예금주").setDescription("예금주명").setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const staff = await prisma.promoStaff.findUnique({ where: { discordUserId: interaction.user.id } });
    if (!staff || staff.status !== "ACTIVE") {
      return interaction.reply({
        embeds: [errorEmbed("홍보직원으로 등록되지 않았습니다. 관리자에게 문의해주세요.")],
        ephemeral: true,
      });
    }

    if (sub === "보기") {
      const stat = await computePromoStaffStats(staff.id);
      const bank = staff.bankName
        ? `${staff.bankName} ${staff.bankAccountNumber} (${staff.accountHolder})`
        : "미등록 - `/홍보실적 계좌등록`으로 등록해주세요.";
      const embed = baseEmbed("📣 내 홍보 실적")
        .addFields(
          { name: "영구 초대 링크", value: `discord.gg/${staff.inviteCode}` },
          { name: "초대 인원", value: `${stat.inviteCount}명`, inline: true },
          { name: "500원↑ 구매자", value: `${stat.qualifyingCount}명`, inline: true },
          { name: "정산 예정액", value: `${stat.amountDue.toLocaleString()}원`, inline: true },
          { name: "등록된 계좌", value: bank }
        )
        .setFooter({ text: "매주 금요일 관리자에게 정산 금액이 안내되고, 등록한 계좌로 수동 송금됩니다." });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 계좌등록
    const bankName = interaction.options.getString("은행", true);
    const bankAccountNumber = interaction.options.getString("계좌번호", true);
    const accountHolder = interaction.options.getString("예금주", true);
    try {
      await registerPromoStaffBank(interaction.user.id, bankName, bankAccountNumber, accountHolder);
      return interaction.reply({ embeds: [successEmbed("정산받을 계좌 정보가 등록되었습니다.")], ephemeral: true });
    } catch (e) {
      const message = e instanceof PromoStaffError ? e.message : "계좌 등록 중 오류가 발생했습니다.";
      return interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  },
};
