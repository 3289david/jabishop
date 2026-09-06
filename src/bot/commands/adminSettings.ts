import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin, requireSuperRole } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import { purgeSeedData } from "@/lib/adminMaintenance";
import type { BotCommand } from "@/bot/types";

export const settingsViewCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("설정보기").setDescription("[관리자] 현재 쇼핑몰 설정을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const s = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
    const embed = baseEmbed("⚙️ 쇼핑몰 설정").addFields(
      { name: "쇼핑몰 이름", value: s?.shopName ?? "-" },
      { name: "입금 계좌", value: `${s?.bankName ?? "-"} ${s?.bankAccountNumber ?? ""} (${s?.bankAccountHolder ?? "-"})` },
      { name: "다운로드 후 환불", value: s?.refundAllowedAfterDownload ? "허용" : "불허" },
      { name: "안내 문구", value: s?.noticeMessage ?? "-" }
    );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const settingsUpdateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("설정수정")
    .setDescription("[관리자/SUPER] 쇼핑몰 설정을 수정합니다.")
    .addStringOption((o) => o.setName("은행명").setDescription("입금 은행명"))
    .addStringOption((o) => o.setName("계좌번호").setDescription("입금 계좌번호"))
    .addStringOption((o) => o.setName("예금주").setDescription("예금주명"))
    .addBooleanOption((o) => o.setName("다운로드후환불허용").setDescription("다운로드한 상품도 환불 허용할지"))
    .addStringOption((o) => o.setName("안내문구").setDescription("사용자에게 보여줄 안내 문구")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    requireSuperRole(admin.role);

    const bankName = interaction.options.getString("은행명");
    const bankAccountNumber = interaction.options.getString("계좌번호");
    const bankAccountHolder = interaction.options.getString("예금주");
    const refundAllowedAfterDownload = interaction.options.getBoolean("다운로드후환불허용");
    const noticeMessage = interaction.options.getString("안내문구");

    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: {
        ...(bankName != null ? { bankName } : {}),
        ...(bankAccountNumber != null ? { bankAccountNumber } : {}),
        ...(bankAccountHolder != null ? { bankAccountHolder } : {}),
        ...(refundAllowedAfterDownload != null ? { refundAllowedAfterDownload } : {}),
        ...(noticeMessage != null ? { noticeMessage } : {}),
      },
      create: {
        id: "singleton",
        bankName: bankName ?? "",
        bankAccountNumber: bankAccountNumber ?? "",
        bankAccountHolder: bankAccountHolder ?? "",
        refundAllowedAfterDownload: refundAllowedAfterDownload ?? false,
        noticeMessage,
      },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SETTINGS_UPDATE" } });
    await interaction.reply({ embeds: [successEmbed("설정이 저장되었습니다.")], ephemeral: true });
  },
};

export const purgeSeedDataCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("데모데이터삭제")
    .setDescription("[관리자/SUPER] 시드 스크립트가 만든 테스트 회원/그림을 전부 삭제합니다.")
    .addStringOption((o) => o.setName("확인").setDescription('정말 삭제하려면 "삭제"를 입력하세요').setRequired(true)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    requireSuperRole(admin.role);
    const confirm = interaction.options.getString("확인", true);
    if (confirm !== "삭제") {
      return interaction.reply({ embeds: [errorEmbed('확인 문구가 일치하지 않습니다. "삭제"를 정확히 입력해주세요.')], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await purgeSeedData();
    await prisma.adminActivityLog.create({
      data: {
        adminId: admin.id,
        action: "PURGE_SEED_DATA",
        detail: `회원 ${result.deletedUsers}명, 주문 ${result.deletedOrders}건, 그림 ${result.deletedArtworks}개 삭제`,
      },
    });
    await interaction.editReply({
      embeds: [
        successEmbed(`데모 데이터 삭제 완료: 회원 ${result.deletedUsers}명, 주문 ${result.deletedOrders}건, 그림 ${result.deletedArtworks}개`),
      ],
    });
  },
};
