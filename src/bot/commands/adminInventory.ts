import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import { tierAutocomplete } from "@/bot/autocomplete";
import { saveBufferToUploads } from "@/bot/fileStorage";
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
    if (!tier) return interaction.editReply({ embeds: [errorEmbed("존재하지 않는 등급입니다.")] });
    if (await prisma.artwork.findUnique({ where: { code } })) {
      return interaction.editReply({ embeds: [errorEmbed("이미 사용 중인 재고 코드입니다.")] });
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
    await interaction.editReply({ embeds: [successEmbed(`"${code}" 계정이 등록되었습니다.`)] });
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

    const embed = baseEmbed("🖼️ 계정 재고 목록 (최근 25개)");
    if (artworks.length === 0) embed.setDescription("조건에 맞는 재고가 없습니다.");
    for (const a of artworks) {
      embed.addFields({ name: `${a.code} · ${a.tier.name}`, value: `${a.title} · ${a.status}` });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
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
    if (!artwork) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 재고 코드입니다.")], ephemeral: true });
    if (artwork.status === "SOLD" || artwork.status === "RESERVED") {
      return interaction.reply({ embeds: [errorEmbed("이미 판매/예약된 재고는 상태를 변경할 수 없습니다.")], ephemeral: true });
    }

    await prisma.artwork.update({ where: { id: artwork.id }, data: { status } });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "ARTWORK_UPDATE", target: artwork.id, detail: status } });
    await interaction.reply({ embeds: [successEmbed(`"${code}" 상태가 ${status}로 변경되었습니다.`)], ephemeral: true });
  },
};
