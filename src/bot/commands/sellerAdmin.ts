import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { buildPanel, panelError, panelSuccess, ephemeral } from "@/bot/ui";
import { sellerAutocomplete } from "@/bot/autocomplete";
import { sellerInfoPayload } from "@/bot/sellerPanels";
import {
  approveSeller,
  rejectSeller,
  suspendSeller,
  restoreSeller,
  expelSeller,
  extendSeller,
  SellerError,
} from "@/lib/sellers";
import { sendDiscordDM } from "@/lib/discordNotify";
import { buildV2Panel, V2_WARNING_COLOR } from "@/lib/panelV2";
import { SELLER_STATUS } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

// 전역 슬래시 커맨드는 100개 한도가 있어서, 판매자 관련 관리자 명령어 11개를
// 서브커맨드로 전부 하나의 "/판매자관리" 커맨드 안에 모았다 (사용자 명령어인
// /판매자신청·/상품등록·/판매자목록·/판매자통계·/판매자신고·/판매자시스템설치는
// 각각 독립 커맨드로 유지).
export const sellerManageCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("판매자관리")
    .setDescription("[관리자] 판매자 승인/정지/연장 등을 관리합니다.")
    .addSubcommand((sc) =>
      sc
        .setName("승인")
        .setDescription("대기 중인 판매자 입점 신청을 승인합니다.")
        .addStringOption((o) =>
          o.setName("판매자").setDescription("판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("거절")
        .setDescription("판매자 입점 신청을 거절합니다.")
        .addStringOption((o) =>
          o.setName("판매자").setDescription("판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((o) => o.setName("사유").setDescription("거절 사유"))
    )
    .addSubcommand((sc) =>
      sc
        .setName("정지")
        .setDescription("판매자 활동을 정지합니다 (채널 읽기전용 + 역할 회수).")
        .addStringOption((o) =>
          o.setName("판매자").setDescription("판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((o) => o.setName("사유").setDescription("정지 사유"))
    )
    .addSubcommand((sc) =>
      sc
        .setName("복구")
        .setDescription("정지/만료된 판매자를 다시 활성화합니다.")
        .addStringOption((o) =>
          o.setName("판매자").setDescription("판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("퇴출")
        .setDescription("판매자 자격을 완전히 회수합니다 (쇼룸 채널 삭제, 복구 불가).")
        .addStringOption((o) =>
          o.setName("판매자").setDescription("판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((o) => o.setName("사유").setDescription("퇴출 사유"))
    )
    .addSubcommand((sc) =>
      sc
        .setName("연장")
        .setDescription("판매자 이용기간을 수동으로 연장합니다 (기본 30일, 자동결제 실패 시 포인트 충전 후 복구용).")
        .addStringOption((o) =>
          o.setName("판매자").setDescription("판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption((o) => o.setName("일수").setDescription("연장할 일수 (기본 30일)").setMinValue(1))
    )
    .addSubcommand((sc) =>
      sc
        .setName("경고")
        .setDescription("판매자에게 경고를 보냅니다 (자격은 유지, DM 발송 + 기록만 남김).")
        .addStringOption((o) =>
          o.setName("판매자").setDescription("판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((o) => o.setName("사유").setDescription("경고 사유").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("정보")
        .setDescription("특정 판매자의 상세 정보를 봅니다.")
        .addStringOption((o) =>
          o.setName("판매자").setDescription("판매자 상점이름/태그로 검색").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) => sc.setName("신청목록").setDescription("대기 중인 판매자 신청을 봅니다."))
    .addSubcommand((sc) => sc.setName("현황").setDescription("전체 판매자 운영 현황을 봅니다."))
    .addSubcommand((sc) =>
      sc
        .setName("공지")
        .setDescription("모든 활성 판매자에게 DM으로 공지를 보냅니다.")
        .addStringOption((o) => o.setName("내용").setDescription("공지 내용").setRequired(true))
    ),
  autocomplete: sellerAutocomplete,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "신청목록") {
      await requireLinkedAdmin(interaction.user.id);
      const pending = await prisma.seller.findMany({ where: { status: SELLER_STATUS.PENDING }, orderBy: { createdAt: "asc" }, take: 25 });
      return interaction.reply(
        ephemeral(
          buildPanel({
            title: "📥 대기 중인 판매자 신청",
            description: pending.length === 0 ? "대기 중인 신청이 없습니다." : undefined,
            fields: pending.map((s) => ({
              name: `${s.storeName} (${s.discordTag})`,
              value: `${s.category ?? "-"} · ${s.saleMethod ?? "-"}\n${s.description ?? ""}`,
            })),
          })
        )
      );
    }

    if (sub === "현황") {
      await requireLinkedAdmin(interaction.user.id);
      const [total, active, pending, expiringSoon, reportsPending, settings] = await Promise.all([
        prisma.seller.count(),
        prisma.seller.count({ where: { status: SELLER_STATUS.ACTIVE } }),
        prisma.seller.count({ where: { status: SELLER_STATUS.PENDING } }),
        prisma.seller.count({
          where: { status: SELLER_STATUS.ACTIVE, nextBillingAt: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
        }),
        prisma.sellerReport.count({ where: { status: "PENDING" } }),
        prisma.shopSetting.findUnique({ where: { id: "singleton" } }),
      ]);
      const monthlyPrice = settings?.sellerMonthlyPrice ?? 1000;
      return interaction.reply(
        ephemeral(
          buildPanel({
            title: "📊 판매자 운영 현황",
            fields: [
              { name: "전체 판매자", value: `${total}명` },
              { name: "활성 판매자", value: `${active}명` },
              { name: "승인 대기", value: `${pending}명` },
              { name: "결제 예정(7일 내)", value: `${expiringSoon}명` },
              { name: "신고 접수(미처리)", value: `${reportsPending}건` },
              { name: "이번 달 입점료 추정", value: `${(active * monthlyPrice).toLocaleString()}P` },
            ],
          })
        )
      );
    }

    if (sub === "공지") {
      const admin = await requireLinkedAdmin(interaction.user.id);
      const content = interaction.options.getString("내용", true);
      await interaction.deferReply({ ephemeral: true });
      const sellers = await prisma.seller.findMany({ where: { status: SELLER_STATUS.ACTIVE } });
      for (const s of sellers) {
        await sendDiscordDM(s.discordUserId, buildV2Panel({ title: "📢 판매자 공지", description: content })).catch(() => {});
      }
      await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_NOTICE", detail: `${sellers.length}명` } });
      return interaction.editReply(panelSuccess(`활성 판매자 ${sellers.length}명에게 공지를 발송했습니다.`));
    }

    if (sub === "정보") {
      await requireLinkedAdmin(interaction.user.id);
      const sellerId = interaction.options.getString("판매자", true);
      const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
      if (!seller) return interaction.reply(ephemeral(panelError("존재하지 않는 판매자입니다.")));
      return interaction.reply(ephemeral(sellerInfoPayload(seller)));
    }

    if (sub === "경고") {
      const admin = await requireLinkedAdmin(interaction.user.id);
      const sellerId = interaction.options.getString("판매자", true);
      const reason = interaction.options.getString("사유", true);
      await interaction.deferReply({ ephemeral: true });
      const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
      if (!seller) return interaction.editReply(panelError("존재하지 않는 판매자입니다."));
      await prisma.seller.update({ where: { id: sellerId }, data: { adminNote: `[경고] ${reason}` } });
      sendDiscordDM(seller.discordUserId, buildV2Panel({ title: "⚠️ 판매자 경고", description: reason, accentColor: V2_WARNING_COLOR })).catch(
        () => {}
      );
      await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_WARN", target: sellerId, detail: reason } });
      return interaction.editReply(panelSuccess(`"${seller.storeName}"에게 경고를 보냈습니다.`));
    }

    // 아래는 전부 서버의 guildId가 필요한(채널/역할 변경) 액션들.
    const admin = await requireLinkedAdmin(interaction.user.id);
    const guildId = interaction.guildId;
    if (!guildId) return interaction.reply(ephemeral(panelError("서버 안에서만 사용할 수 있습니다.")));
    const sellerId = interaction.options.getString("판매자", true);
    await interaction.deferReply({ ephemeral: true });

    try {
      if (sub === "승인") {
        const seller = await approveSeller(sellerId, admin.id, guildId);
        await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_APPROVE", target: sellerId } });
        return interaction.editReply(
          panelSuccess(`"${seller.storeName}" 입점을 승인했습니다.${seller.channelId ? ` <#${seller.channelId}> 채널 생성됨.` : " (채널 생성 실패 - 권한 확인 필요)"}`)
        );
      }
      if (sub === "거절") {
        const note = interaction.options.getString("사유") ?? undefined;
        await rejectSeller(sellerId, admin.id, note);
        await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_REJECT", target: sellerId } });
        return interaction.editReply(panelSuccess("입점 신청을 거절했습니다."));
      }
      if (sub === "정지") {
        const note = interaction.options.getString("사유") ?? undefined;
        await suspendSeller(sellerId, admin.id, guildId, note);
        await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_SUSPEND", target: sellerId } });
        return interaction.editReply(panelSuccess("판매자를 정지했습니다."));
      }
      if (sub === "복구") {
        await restoreSeller(sellerId, admin.id, guildId);
        await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_RESTORE", target: sellerId } });
        return interaction.editReply(panelSuccess("판매자를 복구했습니다."));
      }
      if (sub === "퇴출") {
        const note = interaction.options.getString("사유") ?? undefined;
        await expelSeller(sellerId, admin.id, guildId, note);
        await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_EXPEL", target: sellerId } });
        return interaction.editReply(panelSuccess("판매자를 퇴출했습니다."));
      }
      if (sub === "연장") {
        const days = interaction.options.getInteger("일수") ?? 30;
        const seller = await extendSeller(sellerId, admin.id, guildId, days);
        await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SELLER_EXTEND", target: sellerId, detail: `${days}일` } });
        return interaction.editReply(
          panelSuccess(`"${seller.storeName}" 이용기간을 ${seller.nextBillingAt?.toLocaleDateString("ko-KR")}까지 연장했습니다.`)
        );
      }
    } catch (e) {
      return interaction.editReply(panelError(e instanceof SellerError ? e.message : "처리 중 오류가 발생했습니다."));
    }
  },
};
