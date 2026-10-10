import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin, getOrCreateShopUser } from "@/bot/discordAuth";
import { buildPanel, panelError, panelSuccess, ephemeral } from "@/bot/ui";
import { tierAutocomplete } from "@/bot/autocomplete";
import { saveBufferToUploads, deleteUploadedFile, isUploadKey } from "@/bot/fileStorage";
import { grantArtworkToUser, grantArtworkToUserBulk, OrderError } from "@/lib/orders";
import { ARTWORK_STATUS } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

export const artworkCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("계정등록")
    .setDescription("[관리자] 새 계정 재고를 등록합니다.")
    .addStringOption((o) => o.setName("등급").setDescription("소속 등급").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("코드").setDescription("재고 코드 (예: GOLD-0011)").setRequired(true))
    .addStringOption((o) => o.setName("제목").setDescription("계정 제목").setRequired(true))
    .addAttachmentOption((o) => o.setName("파일").setDescription("계정 원본 파일").setRequired(true)),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const admin = await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급", true);
    const code = interaction.options.getString("코드", true);
    const title = interaction.options.getString("제목", true);
    const attachment = interaction.options.getAttachment("파일", true);

    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.editReply(panelError("존재하지 않는 등급입니다."));
    if (await prisma.artwork.findUnique({ where: { code } })) {
      return interaction.editReply(panelError("이미 사용 중인 재고 코드입니다."));
    }

    const res = await fetch(attachment.url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const fileKey = await saveBufferToUploads(buffer, attachment.name, "artworks");

    const artwork = await prisma.artwork.create({
      data: {
        tierId: tier.id,
        code,
        title,
        fileKey,
        previewKey: fileKey,
        status: "AVAILABLE",
      },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "ARTWORK_CREATE", target: artwork.id, detail: code } });
    await interaction.editReply(panelSuccess(`"${code}" 계정이 등록되었습니다.`));
  },
};

export const artworkListCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("계정목록")
    .setDescription("[관리자] 등급별 계정 재고 목록을 봅니다.")
    .addStringOption((o) => o.setName("등급").setDescription("필터할 등급").setAutocomplete(true))
    .addStringOption((o) =>
      o
        .setName("상태")
        .setDescription("필터할 상태")
        .addChoices(
          { name: "판매가능", value: "AVAILABLE" },
          { name: "예약됨", value: "RESERVED" },
          { name: "판매됨", value: "SOLD" },
          { name: "숨김", value: "HIDDEN" },
          { name: "전체보기", value: "ALL" }
        )
    ),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급");
    const status = interaction.options.getString("상태");

    // 판매완료(SOLD)는 이미 지급이 끝난 재고라, 상태를 따로 고르지 않으면 목록에서 자동 제외한다.
    const statusFilter = status === "ALL" ? {} : status ? { status } : { status: { not: "SOLD" } };

    const tier = slug ? await prisma.tier.findUnique({ where: { slug } }) : null;
    const artworks = await prisma.artwork.findMany({
      where: { ...(tier ? { tierId: tier.id } : {}), ...statusFilter },
      include: { tier: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    await interaction.reply(
      ephemeral(
        buildPanel({
          title: "🖼️ 계정 재고 목록 (최근 25개)",
          description: artworks.length === 0 ? "조건에 맞는 재고가 없습니다." : undefined,
          fields: artworks.map((a) => ({ name: `${a.code} · ${a.tier.name}`, value: `${a.title} · ${a.status}` })),
        })
      )
    );
  },
};

export const artworkStatusCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("계정상태변경")
    .setDescription("[관리자] 계정 재고의 판매 상태를 변경합니다.")
    .addStringOption((o) => o.setName("코드").setDescription("재고 코드").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("상태")
        .setDescription("변경할 상태")
        .setRequired(true)
        .addChoices({ name: "판매가능", value: "AVAILABLE" }, { name: "숨김", value: "HIDDEN" })
    ),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const code = interaction.options.getString("코드", true);
    const status = interaction.options.getString("상태", true);

    const artwork = await prisma.artwork.findUnique({ where: { code } });
    if (!artwork) return interaction.reply(ephemeral(panelError("존재하지 않는 재고 코드입니다.")));
    if (artwork.status === "SOLD" || artwork.status === "RESERVED") {
      return interaction.reply(ephemeral(panelError("이미 판매/예약된 재고는 상태를 변경할 수 없습니다.")));
    }

    await prisma.artwork.update({ where: { id: artwork.id }, data: { status } });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "ARTWORK_UPDATE", target: artwork.id, detail: status } });
    await interaction.reply(ephemeral(panelSuccess(`"${code}" 상태가 ${status}로 변경되었습니다.`)));
  },
};

export const artworkDeleteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("계정삭제")
    .setDescription("[관리자] 특정 계정 재고를 삭제합니다.")
    .addStringOption((o) => o.setName("코드").setDescription("삭제할 재고 코드").setRequired(true)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const code = interaction.options.getString("코드", true);

    const artwork = await prisma.artwork.findUnique({ where: { code } });
    if (!artwork) return interaction.reply(ephemeral(panelError("존재하지 않는 재고 코드입니다.")));

    if (artwork.status === ARTWORK_STATUS.SOLD || artwork.status === ARTWORK_STATUS.RESERVED) {
      // 이미 판매/예약된 재고는 실수 삭제를 막기 위해 숨김 처리만 한다 (웹 관리자 패널과 동일한 정책).
      await prisma.artwork.update({ where: { id: artwork.id }, data: { status: ARTWORK_STATUS.HIDDEN } });
      await prisma.adminActivityLog.create({
        data: { adminId: admin.id, action: "ARTWORK_HIDE", target: artwork.id, detail: "판매/예약 상태라 숨김 처리" },
      });
      return interaction.reply(ephemeral(panelSuccess(`"${code}"는 이미 판매/예약되어 삭제 대신 숨김 처리했습니다.`)));
    }

    if (isUploadKey(artwork.fileKey)) await deleteUploadedFile(artwork.fileKey);
    if (artwork.previewKey && artwork.previewKey !== artwork.fileKey && isUploadKey(artwork.previewKey)) {
      await deleteUploadedFile(artwork.previewKey);
    }
    await prisma.artwork.delete({ where: { id: artwork.id } });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "ARTWORK_DELETE", target: artwork.id, detail: code } });
    await interaction.reply(ephemeral(panelSuccess(`"${code}" 재고가 삭제되었습니다.`)));
  },
};

export const artworkGrantCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("계정지급")
    .setDescription("[관리자] 결제 없이 특정 회원에게 계정을 지급합니다.")
    .addStringOption((o) => o.setName("등급").setDescription("지급할 등급").setRequired(true).setAutocomplete(true))
    .addUserOption((o) => o.setName("대상").setDescription("지급받을 디스코드 사용자").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("수량").setDescription("지급할 개수 (기본 1, 최대 50)").setMinValue(1).setMaxValue(50).setRequired(false)
    ),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const admin = await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급", true);
    const target = interaction.options.getUser("대상", true);
    const quantity = interaction.options.getInteger("수량") ?? 1;

    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.editReply(panelError("존재하지 않는 등급입니다."));

    const user = await getOrCreateShopUser(target.id, target.tag);

    if (quantity > 1) {
      const result = await grantArtworkToUserBulk({ tierId: tier.id, userId: user.id, quantity });
      if (result.successCount > 0) {
        await prisma.adminActivityLog.create({
          data: {
            adminId: admin.id,
            action: "ARTWORK_GRANT",
            target: result.lastOrder?.id ?? "",
            detail: `${tier.name} x${result.successCount} → ${target.tag}`,
          },
        });
      }
      const dmWarning =
        result.dmFailCount > 0
          ? `\n⚠️ 이 중 ${result.dmFailCount}건은 DM 발송에 실패했습니다 (DM 허용을 꺼뒀거나 봇을 차단한 것 같습니다). 마이페이지 주문내역에서 직접 확인하도록 안내해주세요.`
          : "";
      const payload =
        result.failedCount > 0
          ? panelError(
              `${target.username}님에게 "${tier.name}" 계정 ${result.successCount}개 지급 완료 후 중단됨 - ${result.lastError}${dmWarning}`
            )
          : panelSuccess(`${target.username}님에게 "${tier.name}" 계정 ${result.successCount}개를 지급했습니다.${dmWarning}`);
      await interaction.editReply(payload);
      return;
    }

    try {
      const order = await grantArtworkToUser({ tierId: tier.id, userId: user.id });
      await prisma.adminActivityLog.create({
        data: { adminId: admin.id, action: "ARTWORK_GRANT", target: order.id, detail: `${tier.name} → ${target.tag}` },
      });
      const dmWarning = order.dmSent
        ? ""
        : "\n⚠️ DM 발송에 실패했습니다 (서버 멤버 DM 허용을 꺼뒀거나 봇을 차단한 것 같습니다). 마이페이지 주문내역에서 직접 확인하도록 안내해주세요.";
      await interaction.editReply(panelSuccess(`${target.username}님에게 "${tier.name}" 계정을 지급했습니다. (주문 #${order.orderNo})${dmWarning}`));
    } catch (e) {
      const message = e instanceof OrderError ? e.message : "지급 중 오류가 발생했습니다.";
      await interaction.editReply(panelError(message));
    }
  },
};

export const artworkBulkDeleteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("재고일괄삭제")
    .setDescription("[관리자] 특정 등급의 판매되지 않은 재고를 전부 삭제합니다.")
    .addStringOption((o) => o.setName("등급").setDescription("대상 등급").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("확인").setDescription('정말 삭제하려면 "삭제"를 입력하세요').setRequired(true)),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급", true);
    const confirm = interaction.options.getString("확인", true);
    if (confirm !== "삭제") {
      return interaction.reply(ephemeral(panelError('확인 문구가 일치하지 않습니다. "삭제"를 정확히 입력해주세요.')));
    }

    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.reply(ephemeral(panelError("존재하지 않는 등급입니다.")));

    await interaction.deferReply({ ephemeral: true });

    const deletable = await prisma.artwork.findMany({
      where: { tierId: tier.id, status: { in: [ARTWORK_STATUS.AVAILABLE, ARTWORK_STATUS.HIDDEN] } },
    });
    for (const artwork of deletable) {
      if (isUploadKey(artwork.fileKey)) await deleteUploadedFile(artwork.fileKey);
      if (artwork.previewKey && artwork.previewKey !== artwork.fileKey && isUploadKey(artwork.previewKey)) {
        await deleteUploadedFile(artwork.previewKey);
      }
    }
    const result = await prisma.artwork.deleteMany({ where: { id: { in: deletable.map((a) => a.id) } } });
    const protectedCount = await prisma.artwork.count({
      where: { tierId: tier.id, status: { in: [ARTWORK_STATUS.SOLD, ARTWORK_STATUS.RESERVED, ARTWORK_STATUS.EXCHANGED] } },
    });

    await prisma.adminActivityLog.create({
      data: {
        adminId: admin.id,
        action: "ARTWORK_BULK_DELETE",
        target: tier.id,
        detail: `${result.count}건 삭제${protectedCount > 0 ? `, 판매/예약/교환 이력 ${protectedCount}건은 보존` : ""}`,
      },
    });
    await interaction.editReply(
      panelSuccess(
        `"${tier.name}" 등급 재고 ${result.count}건을 삭제했습니다.${protectedCount > 0 ? ` (판매/예약/교환 이력 ${protectedCount}건은 보존됨)` : ""}`
      )
    );
  },
};
