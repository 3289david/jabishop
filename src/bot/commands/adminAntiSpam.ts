import { SlashCommandBuilder, ChannelType } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin, requireSuperRole } from "@/bot/discordAuth";
import { buildPanel, panelSuccess, ephemeral } from "@/bot/ui";
import { VIOLATION_LABEL } from "@/bot/antiSpam";
import type { BotCommand } from "@/bot/types";

const EMPTY_SHOP_SETTING_DEFAULTS = { bankName: "", bankAccountNumber: "", bankAccountHolder: "" };

export const antiSpamCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("안티스팸")
    .setDescription("[관리자] 메시지 도배/스팸 자동 감지·제재 기능을 설정/조회합니다.")
    .addSubcommand((sc) =>
      sc
        .setName("설정")
        .setDescription("[SUPER] 안티스팸 기능을 켜고 끄거나 기준값을 조정합니다.")
        .addBooleanOption((o) => o.setName("활성화").setDescription("기능 전체 on/off"))
        .addChannelOption((o) =>
          o.setName("로그채널").setDescription("제재 로그 + 오탐 해제 버튼이 올라올 채널").addChannelTypes(ChannelType.GuildText)
        )
        .addIntegerOption((o) =>
          o.setName("도배기준").setDescription("도배시간초 안에 이 개수 이상 보내면 도배로 간주 (기본 6)").setMinValue(2).setMaxValue(50)
        )
        .addIntegerOption((o) => o.setName("도배시간초").setDescription("도배 판단 기준 시간/초 (기본 5)").setMinValue(2).setMaxValue(60))
        .addIntegerOption((o) =>
          o.setName("멘션기준").setDescription("한 메시지의 멘션(유저+역할) 수가 이 이상이면 멘션폭탄 (기본 5)").setMinValue(2).setMaxValue(50)
        )
        .addIntegerOption((o) =>
          o.setName("긴급모드기준").setDescription("서버 전체 위반이 짧은 시간 안에 이 횟수를 넘으면 긴급모드 발동 (기본 10)").setMinValue(3).setMaxValue(100)
        )
        .addIntegerOption((o) =>
          o.setName("긴급모드시간분").setDescription("긴급모드(전체 슬로우모드 10초) 유지 시간/분 (기본 10)").setMinValue(1).setMaxValue(120)
        )
        .addBooleanOption((o) => o.setName("사진금지").setDescription("켜면 사진 첨부를 도배 여부와 무관하게 전부 삭제"))
        .addBooleanOption((o) => o.setName("영상금지").setDescription("켜면 영상 첨부를 도배 여부와 무관하게 전부 삭제"))
        .addIntegerOption((o) =>
          o
            .setName("부계정최소일수")
            .setDescription("계정 생성일이 이 일수보다 어리면 부계정 의심 (0=비활성)")
            .setMinValue(0)
            .setMaxValue(365)
        )
        .addBooleanOption((o) =>
          o.setName("유사이름감지").setDescription("켜면 신규 입장자 닉네임이 기존 멤버와 너무 비슷할 때(예: eme/eme1) 부계정 의심")
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("화이트리스트")
        .setDescription("[SUPER] 안티스팸 감지에서 제외할 역할을 지정합니다 (관리자는 항상 자동 제외).")
        .addRoleOption((o) => o.setName("역할").setDescription("이 역할을 가진 멤버는 감지하지 않음").setRequired(true))
    )
    .addSubcommand((sc) => sc.setName("통계").setDescription("최근 24시간 안티스팸 제재 통계를 봅니다.")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "통계") {
      await requireLinkedAdmin(interaction.user.id);
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [total24h, byType, topUsers, topChannels] = await Promise.all([
        prisma.spamViolation.count({ where: { createdAt: { gte: since24h } } }),
        prisma.spamViolation.groupBy({
          by: ["violationType"],
          _count: { _all: true },
          where: { createdAt: { gte: since24h } },
        }),
        prisma.spamViolation.groupBy({
          by: ["discordUserId", "discordTag"],
          _count: { _all: true },
          where: { createdAt: { gte: since24h } },
          orderBy: { _count: { discordUserId: "desc" } },
          take: 5,
        }),
        prisma.spamViolation.groupBy({
          by: ["channelId"],
          _count: { _all: true },
          where: { createdAt: { gte: since24h } },
          orderBy: { _count: { channelId: "desc" } },
          take: 5,
        }),
      ]);

      const typeLines =
        byType.map((b) => `${VIOLATION_LABEL[b.violationType] ?? b.violationType}: ${b._count._all}건`).join("\n") || "없음";
      const userLines = topUsers.map((u) => `${u.discordTag}: ${u._count._all}건`).join("\n") || "없음";
      const channelLines = topChannels.map((c) => `<#${c.channelId}>: ${c._count._all}건`).join("\n") || "없음";

      return interaction.reply(
        ephemeral(
          buildPanel({
            title: "🛡️ 안티스팸 통계 (최근 24시간)",
            fields: [
              { name: "전체 제재", value: `${total24h}건` },
              { name: "유형별", value: typeLines },
              { name: "위반 많은 유저 Top5", value: userLines },
              { name: "위반 많은 채널 Top5", value: channelLines },
            ],
          })
        )
      );
    }

    if (sub === "화이트리스트") {
      const admin = await requireLinkedAdmin(interaction.user.id);
      requireSuperRole(admin.role);
      const role = interaction.options.getRole("역할", true);
      await prisma.shopSetting.upsert({
        where: { id: "singleton" },
        update: { antiSpamWhitelistRoleId: role.id },
        create: { id: "singleton", ...EMPTY_SHOP_SETTING_DEFAULTS, antiSpamWhitelistRoleId: role.id },
      });
      return interaction.reply(ephemeral(panelSuccess(`<@&${role.id}> 역할을 안티스팸 화이트리스트로 설정했습니다.`)));
    }

    // 설정
    const admin = await requireLinkedAdmin(interaction.user.id);
    requireSuperRole(admin.role);
    const enabled = interaction.options.getBoolean("활성화");
    const logChannel = interaction.options.getChannel("로그채널");
    const floodCount = interaction.options.getInteger("도배기준");
    const floodWindowSec = interaction.options.getInteger("도배시간초");
    const mentionLimit = interaction.options.getInteger("멘션기준");
    const emergencyThreshold = interaction.options.getInteger("긴급모드기준");
    const emergencyDurationMin = interaction.options.getInteger("긴급모드시간분");
    const blockImages = interaction.options.getBoolean("사진금지");
    const blockVideos = interaction.options.getBoolean("영상금지");
    const altAccountMinAgeDays = interaction.options.getInteger("부계정최소일수");
    const similarNameCheck = interaction.options.getBoolean("유사이름감지");

    const data = {
      ...(enabled != null ? { antiSpamEnabled: enabled } : {}),
      ...(logChannel ? { antiSpamLogChannelId: logChannel.id } : {}),
      ...(floodCount != null ? { antiSpamFloodCount: floodCount } : {}),
      ...(floodWindowSec != null ? { antiSpamFloodWindowSec: floodWindowSec } : {}),
      ...(mentionLimit != null ? { antiSpamMentionLimit: mentionLimit } : {}),
      ...(emergencyThreshold != null ? { antiSpamEmergencyThreshold: emergencyThreshold } : {}),
      ...(emergencyDurationMin != null ? { antiSpamEmergencyDurationMin: emergencyDurationMin } : {}),
      ...(blockImages != null ? { antiSpamBlockImages: blockImages } : {}),
      ...(blockVideos != null ? { antiSpamBlockVideos: blockVideos } : {}),
      ...(altAccountMinAgeDays != null ? { antiSpamAltAccountMinAgeDays: altAccountMinAgeDays } : {}),
      ...(similarNameCheck != null ? { antiSpamSimilarNameCheck: similarNameCheck } : {}),
    };

    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...EMPTY_SHOP_SETTING_DEFAULTS, ...data },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "ANTISPAM_SETTINGS_UPDATE" } });
    return interaction.reply(ephemeral(panelSuccess("안티스팸 설정이 저장되었습니다.")));
  },
};
