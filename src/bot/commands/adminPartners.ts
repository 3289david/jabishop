import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import { approvePartner, rejectPartner, adminCreatePartner, PartnerError } from "@/lib/partners";
import type { BotCommand } from "@/bot/types";

export const partnerListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("파트너목록").setDescription("[관리자] 대기 중인 파트너 신청을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const partners = await prisma.partner.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    const embed = baseEmbed("🤝 대기 중인 파트너 신청");
    if (partners.length === 0) embed.setDescription("대기 중인 신청이 없습니다.");
    for (const p of partners) {
      embed.addFields({
        name: `${p.name} (${p.discordTag})`,
        value: `${p.description ?? "-"} · 웹훅: ${p.webhookUrl ? "등록됨" : "없음"} · ID: \`${p.id}\``,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const partnerCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("파트너생성")
    .setDescription("[관리자] 신청/승인 절차 없이 바로 파트너로 등록합니다 (채널 생성 + 역할 지급까지 즉시 처리).")
    .addUserOption((o) => o.setName("대상").setDescription("파트너로 등록할 디스코드 사용자").setRequired(true))
    .addStringOption((o) => o.setName("이름").setDescription("파트너 서버/채널 이름").setRequired(true))
    .addStringOption((o) => o.setName("이모지").setDescription("생성될 채널명 앞에 붙일 이모지 (비우면 기본 🤝)"))
    .addStringOption((o) => o.setName("소개").setDescription("간단한 소개"))
    .addStringOption((o) => o.setName("웹훅url").setDescription("파트너 웹훅 URL (선택 - 나중에 파트너가 직접 등록해도 됨)")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const target = interaction.options.getUser("대상", true);
    const name = interaction.options.getString("이름", true);
    const emoji = interaction.options.getString("이모지") ?? undefined;
    const description = interaction.options.getString("소개") ?? undefined;
    const webhookUrl = interaction.options.getString("웹훅url") ?? undefined;
    await interaction.deferReply({ ephemeral: true });

    let result;
    try {
      result = await adminCreatePartner({
        discordUserId: target.id,
        discordTag: target.tag,
        name,
        emoji,
        description,
        webhookUrl,
        adminId: admin.id,
      });
    } catch (e) {
      return interaction.editReply({
        embeds: [errorEmbed(e instanceof PartnerError ? e.message : "생성 중 오류가 발생했습니다.")],
      });
    }

    await prisma.adminActivityLog.create({
      data: { adminId: admin.id, action: "PARTNER_ADMIN_CREATE", target: result.partner.id, detail: `${name} → ${target.tag}` },
    });
    await interaction.editReply({
      embeds: [
        successEmbed(
          `${target.username}님을 파트너로 등록했습니다.${result.channelId ? ` <#${result.channelId}> 채널 생성됨.` : " (채널 생성 안 됨 - 파트너 카테고리 설정을 확인해주세요)"}${result.roleGranted ? " 역할도 지급됨." : ""}`
        ),
      ],
    });
  },
};

export const partnerApproveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("파트너승인")
    .setDescription("[관리자] 파트너 신청을 승인합니다 (채널 생성 + 역할 지급).")
    .addStringOption((o) => o.setName("파트너id").setDescription("/파트너목록에서 확인한 ID").setRequired(true)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("파트너id", true);
    await interaction.deferReply({ ephemeral: true });

    let result;
    try {
      result = await approvePartner(id, admin.id);
    } catch (e) {
      return interaction.editReply({
        embeds: [errorEmbed(e instanceof PartnerError ? e.message : "처리 중 오류가 발생했습니다.")],
      });
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "PARTNER_APPROVE", target: id } });
    await interaction.editReply({
      embeds: [
        successEmbed(
          `파트너를 승인했습니다.${result.channelId ? ` <#${result.channelId}> 채널 생성됨.` : " (채널 생성 안 됨 - 파트너 카테고리 설정을 확인해주세요)"}${result.roleGranted ? " 역할도 지급됨." : ""}`
        ),
      ],
    });
  },
};

export const partnerRejectCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("파트너거절")
    .setDescription("[관리자] 파트너 신청을 거절합니다.")
    .addStringOption((o) => o.setName("파트너id").setDescription("/파트너목록에서 확인한 ID").setRequired(true))
    .addStringOption((o) => o.setName("사유").setDescription("거절 사유")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const id = interaction.options.getString("파트너id", true);
    const note = interaction.options.getString("사유") ?? undefined;
    try {
      await rejectPartner(id, admin.id, note);
    } catch (e) {
      return interaction.reply({
        embeds: [errorEmbed(e instanceof PartnerError ? e.message : "처리 중 오류가 발생했습니다.")],
        ephemeral: true,
      });
    }
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "PARTNER_REJECT", target: id, detail: note } });
    await interaction.reply({ embeds: [successEmbed("파트너 신청을 거절했습니다.")], ephemeral: true });
  },
};
