import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin, requireSuperRole } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { createGuildCategory, createPlainGuildChannel, createGuildRole } from "@/lib/discordNotify";
import { sellerGuideEmbed, sellerApplyRow } from "@/bot/sellerPanels";
import type { BotCommand } from "@/bot/types";

// 판매자 시스템에 필요한 카테고리/채널/역할을 전부 자동으로 만든다 - 관리자가 디스코드에서
// 직접 카테고리를 만들고 ID를 일일이 등록할 필요가 없게 하기 위함. 이미 설치되어 있으면
// 다시 실행해도 기존 걸 덮어쓰지 않고 안내만 한다 (실수로 중복 생성 방지).
export const sellerSetupCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("판매자시스템설치")
    .setDescription("[관리자/SUPER] 판매자 시스템에 필요한 채널/역할을 자동으로 만듭니다 (최초 1회)."),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    requireSuperRole(admin.role);
    const guildId = interaction.guildId;
    if (!guildId) return interaction.reply({ embeds: [errorEmbed("서버 안에서만 사용할 수 있습니다.")], ephemeral: true });

    const existing = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
    if (existing?.sellerCategoryId) {
      return interaction.reply({
        embeds: [errorEmbed("이미 판매자 시스템이 설치되어 있습니다. 다시 설치하려면 먼저 관리자에게 기존 채널/역할을 정리해달라고 요청해주세요.")],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const infoCategoryId = await createGuildCategory(guildId, "🛒 판매자");
    if (!infoCategoryId) {
      return interaction.editReply({ embeds: [errorEmbed("카테고리 생성에 실패했습니다 (봇 권한을 확인해주세요).")] });
    }
    const showroomCategoryId = await createGuildCategory(guildId, "🏪 입점 판매자");
    const ticketCategoryId = await createGuildCategory(guildId, "🎫 구매 문의");
    const manageCategoryId = await createGuildCategory(guildId, "🔧 판매자 관리");
    const sellerRoleId = await createGuildRole(guildId, "판매자", 0xf59e0b);

    const guideChannelId = await createPlainGuildChannel(guildId, "📋판매자-안내", infoCategoryId);
    await createPlainGuildChannel(guildId, "📢판매자-공지", infoCategoryId);
    await createPlainGuildChannel(guildId, "⭐판매자-후기", infoCategoryId);

    const settings = await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: {
        sellerCategoryId: showroomCategoryId,
        sellerTicketCategoryId: ticketCategoryId,
        sellerManageCategoryId: manageCategoryId,
        sellerRoleId,
      },
      create: {
        id: "singleton",
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolder: "",
        sellerCategoryId: showroomCategoryId,
        sellerTicketCategoryId: ticketCategoryId,
        sellerManageCategoryId: manageCategoryId,
        sellerRoleId,
      },
    });

    if (guideChannelId) {
      const embed = sellerGuideEmbed(settings.sellerMonthlyPrice, settings.sellerFreeTrialDays);
      await fetch(`https://discord.com/api/v10/channels/${guideChannelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed.toJSON()], components: [sellerApplyRow().toJSON()] }),
      }).catch(() => {});
    }

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_SYSTEM_SETUP" } });
    await interaction.editReply({
      embeds: [
        successEmbed(
          [
            "판매자 시스템 설치가 완료되었습니다!",
            guideChannelId ? `<#${guideChannelId}> 채널에서 신청받을 수 있습니다.` : null,
            !showroomCategoryId || !ticketCategoryId || !manageCategoryId || !sellerRoleId
              ? "⚠️ 일부 항목(카테고리/역할)이 생성되지 않았습니다 - 봇의 '채널 관리'/'역할 관리' 권한을 확인해주세요."
              : null,
          ]
            .filter(Boolean)
            .join("\n")
        ),
      ],
    });
  },
};
