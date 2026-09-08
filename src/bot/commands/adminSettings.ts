import { SlashCommandBuilder, ChannelType } from "discord.js";
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
      { name: "안내 문구", value: s?.noticeMessage ?? "-" },
      { name: "구매 로그 채널", value: s?.discordPurchaseLogChannelId ? `<#${s.discordPurchaseLogChannelId}>` : "미설정" },
      {
        name: "자동삭제 채팅 채널",
        value: s?.discordAutoDeleteChannelId ? `<#${s.discordAutoDeleteChannelId}> (5초 후 자동 삭제)` : "미설정",
      },
      {
        name: "누적 구매금액 등급 역할",
        value: [
          `150,000원↑(10%): ${s?.discordRoleTier150k ? `<@&${s.discordRoleTier150k}>` : "미설정"}`,
          `100,000원↑(8%): ${s?.discordRoleTier100k ? `<@&${s.discordRoleTier100k}>` : "미설정"}`,
          `50,000원↑(5%): ${s?.discordRoleTier50k ? `<@&${s.discordRoleTier50k}>` : "미설정"}`,
          `10,000원↑: ${s?.discordRoleTier10k ? `<@&${s.discordRoleTier10k}>` : "미설정"}`,
          `구매자: ${s?.discordRoleBuyer ? `<@&${s.discordRoleBuyer}>` : "미설정"}`,
        ].join("\n"),
      }
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
    .addStringOption((o) => o.setName("안내문구").setDescription("사용자에게 보여줄 안내 문구"))
    .addChannelOption((o) =>
      o.setName("구매로그채널").setDescription("구매 발생 시 공지할 채널").addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption((o) =>
      o
        .setName("자동삭제채팅채널")
        .setDescription("이 채널의 모든 메시지를 5초 후 자동 삭제")
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption((o) => o.setName("역할150k").setDescription("누적 150,000원 이상 (10% 할인) 역할"))
    .addRoleOption((o) => o.setName("역할100k").setDescription("누적 100,000원 이상 (8% 할인) 역할"))
    .addRoleOption((o) => o.setName("역할50k").setDescription("누적 50,000원 이상 (5% 할인) 역할"))
    .addRoleOption((o) => o.setName("역할10k").setDescription("누적 10,000원 이상 (표시 전용) 역할"))
    .addRoleOption((o) => o.setName("역할구매자").setDescription("1원 이상 구매자 전원에게 줄 역할")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    requireSuperRole(admin.role);

    const bankName = interaction.options.getString("은행명");
    const bankAccountNumber = interaction.options.getString("계좌번호");
    const bankAccountHolder = interaction.options.getString("예금주");
    const refundAllowedAfterDownload = interaction.options.getBoolean("다운로드후환불허용");
    const noticeMessage = interaction.options.getString("안내문구");
    const purchaseLogChannel = interaction.options.getChannel("구매로그채널");
    const autoDeleteChannel = interaction.options.getChannel("자동삭제채팅채널");
    const roleTier150k = interaction.options.getRole("역할150k");
    const roleTier100k = interaction.options.getRole("역할100k");
    const roleTier50k = interaction.options.getRole("역할50k");
    const roleTier10k = interaction.options.getRole("역할10k");
    const roleBuyer = interaction.options.getRole("역할구매자");

    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: {
        ...(bankName != null ? { bankName } : {}),
        ...(bankAccountNumber != null ? { bankAccountNumber } : {}),
        ...(bankAccountHolder != null ? { bankAccountHolder } : {}),
        ...(refundAllowedAfterDownload != null ? { refundAllowedAfterDownload } : {}),
        ...(noticeMessage != null ? { noticeMessage } : {}),
        ...(purchaseLogChannel ? { discordPurchaseLogChannelId: purchaseLogChannel.id } : {}),
        ...(autoDeleteChannel ? { discordAutoDeleteChannelId: autoDeleteChannel.id } : {}),
        ...(roleTier150k ? { discordRoleTier150k: roleTier150k.id } : {}),
        ...(roleTier100k ? { discordRoleTier100k: roleTier100k.id } : {}),
        ...(roleTier50k ? { discordRoleTier50k: roleTier50k.id } : {}),
        ...(roleTier10k ? { discordRoleTier10k: roleTier10k.id } : {}),
        ...(roleBuyer ? { discordRoleBuyer: roleBuyer.id } : {}),
      },
      create: {
        id: "singleton",
        bankName: bankName ?? "",
        bankAccountNumber: bankAccountNumber ?? "",
        bankAccountHolder: bankAccountHolder ?? "",
        refundAllowedAfterDownload: refundAllowedAfterDownload ?? false,
        noticeMessage,
        discordPurchaseLogChannelId: purchaseLogChannel?.id,
        discordAutoDeleteChannelId: autoDeleteChannel?.id,
        discordRoleTier150k: roleTier150k?.id,
        discordRoleTier100k: roleTier100k?.id,
        discordRoleTier50k: roleTier50k?.id,
        discordRoleTier10k: roleTier10k?.id,
        discordRoleBuyer: roleBuyer?.id,
      },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SETTINGS_UPDATE" } });
    await interaction.reply({ embeds: [successEmbed("설정이 저장되었습니다.")], ephemeral: true });
  },
};

export const purgeSeedDataCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("데모데이터삭제")
    .setDescription("[관리자/SUPER] 시드 스크립트가 만든 테스트 회원/계정을 전부 삭제합니다.")
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
        detail: `회원 ${result.deletedUsers}명, 주문 ${result.deletedOrders}건, 계정 ${result.deletedArtworks}개 삭제`,
      },
    });
    await interaction.editReply({
      embeds: [
        successEmbed(`데모 데이터 삭제 완료: 회원 ${result.deletedUsers}명, 주문 ${result.deletedOrders}건, 계정 ${result.deletedArtworks}개`),
      ],
    });
  },
};
