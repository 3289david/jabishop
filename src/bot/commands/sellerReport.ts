import { SlashCommandBuilder } from "discord.js";
import { fileSellerReport, SellerError } from "@/lib/sellers";
import { errorEmbed, successEmbed } from "@/bot/format";
import { sellerAutocomplete } from "@/bot/autocomplete";
import { SELLER_REPORT_REASONS } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

// 거래 중(티켓 안)이 아니어도, 판매자목록/쇼룸 채널을 보다가 바로 신고할 수 있게
// 별도 슬래시 커맨드도 둔다 (티켓 안의 🚨 신고 버튼은 src/bot/sellerTicketHandlers.ts 참고).
export const sellerReportCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("판매자신고")
    .setDescription("판매자를 신고합니다.")
    .addStringOption((o) =>
      o.setName("판매자").setDescription("신고할 판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((o) =>
      o
        .setName("사유")
        .setDescription("신고 사유")
        .setRequired(true)
        .addChoices(...SELLER_REPORT_REASONS.map((r) => ({ name: r, value: r })))
    )
    .addStringOption((o) => o.setName("상세").setDescription("상세 설명 (선택)")),
  autocomplete: sellerAutocomplete,
  async execute(interaction) {
    const sellerId = interaction.options.getString("판매자", true);
    const reason = interaction.options.getString("사유", true);
    const detail = interaction.options.getString("상세") ?? undefined;
    await interaction.deferReply({ ephemeral: true });

    try {
      await fileSellerReport({ sellerId, reporterDiscordId: interaction.user.id, reason, detail });
      await interaction.editReply({ embeds: [successEmbed("신고가 접수되었습니다. 관리자가 확인 후 조치합니다.")] });
    } catch (e) {
      await interaction.editReply({ embeds: [errorEmbed(e instanceof SellerError ? e.message : "처리 중 오류가 발생했습니다.")] });
    }
  },
};
