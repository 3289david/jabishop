import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { errorEmbed } from "@/bot/format";
import { sellerListEmbed, sellerManagePanelRow, sellerStatsEmbed } from "@/bot/sellerPanels";
import { SELLER_STATUS } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

export const sellerListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("판매자목록").setDescription("현재 활동 중인 판매자 목록을 봅니다."),
  async execute(interaction) {
    const sellers = await prisma.seller.findMany({
      where: { status: SELLER_STATUS.ACTIVE },
      orderBy: { dealCount: "desc" },
      take: 25,
    });
    await interaction.reply({ embeds: [sellerListEmbed(sellers)], ephemeral: true });
  },
};

// 이 명령어가 판매자 자기관리의 진입점 역할도 한다(통계 + 관리 버튼) - 전역 슬래시
// 커맨드 100개 한도에 걸려서 "/판매자패널"을 따로 만들지 않고 여기에 합쳤다.
export const sellerStatsCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("판매자통계").setDescription("[판매자] 내 판매 통계를 보고, 상품/문의를 관리합니다."),
  async execute(interaction) {
    const seller = await prisma.seller.findUnique({ where: { discordUserId: interaction.user.id } });
    if (!seller) {
      return interaction.reply({ embeds: [errorEmbed("판매자 등록 정보가 없습니다.")], ephemeral: true });
    }

    const embed = await sellerStatsEmbed(seller);
    await interaction.reply({ embeds: [embed], components: sellerManagePanelRow(), ephemeral: true });
  },
};
