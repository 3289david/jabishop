import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import { tierAutocomplete } from "@/bot/autocomplete";
import { saveBufferToUploads } from "@/bot/fileStorage";
import { ARTWORK_CATEGORIES } from "@/lib/constants";
import type { BotCommand } from "@/bot/types";

export const artworkCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("계정등록")
    .setDescription("[관리자] 새 계정 재고를 등록합니다.")
    .addStringOption((o) => o.setName("등급").setDescription("소속 등급").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("코드").setDescription("재고 코드 (예: GOLD-0011)").setRequired(true))
    .addStringOption((o) => o.setName("제목").setDescription("계정 제목").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("카테고리")
        .setDescription("계정 카테고리")
        .setRequired(true)
        .addChoices(...ARTWORK_CATEGORIES.map((c) => ({ name: c, value: c })))
    )
    .addAttachmentOption((o) => o.setName("파일").setDescription("계정 원본 파일").setRequired(true))
    .addStringOption((o) => o.setName("품질").setDescription("품질/설명"))
    .addIntegerOption((o) => o.setName("가로").setDescription("가로(px)"))
    .addIntegerOption((o) => o.setName("세로").setDescription("세로(px)"))
    .addStringOption((o) => o.setName("시리즈").setDescription("시리즈명"))
    .addIntegerOption((o) => o.setName("희귀도").setDescription("1~5").setMinValue(1).setMaxValue(5))
    .addBooleanOption((o) => o.setName("한정판").setDescription("한정판 여부")),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const admin = await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급", true);
    const code = interaction.options.getString("코드", true);
    const title = interaction.options.getString("제목", true);
    const category = interaction.options.getString("카테고리", true);
    const attachment = interaction.options.getAttachment("파일", true);

    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.editReply({ embeds: [errorEmbed("존재하지 않는 등급입니다.")] });
    if (await prisma.artwork.findUnique({ where: { code } })) {
      return interaction.editReply({ embeds: [errorEmbed("이미 사용 중인 재고 코드입니다.")] });
    }

    const res = await fetch(attachment.url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const fileKey = await saveBufferToUploads(buffer, attachment.name, "artworks");
    const fileFormat = attachment.name.split(".").pop()?.toUpperCase() ?? null;

    const artwork = await prisma.artwork.create({
      data: {
        tierId: tier.id,
        code,
        title,
        category,
        quality: interaction.options.getString("품질"),
        widthPx: interaction.options.getInteger("가로"),
        heightPx: interaction.options.getInteger("세로"),
        series: interaction.options.getString("시리즈"),
        rarityStars: interaction.options.getInteger("희귀도") ?? 1,
        limitedEdition: interaction.options.getBoolean("한정판") ?? false,
        fileFormat,
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
          { name: "숨김", value: "HIDDEN" }
        )
    ),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급");
    const status = interaction.options.getString("상태");

    const tier = slug ? await prisma.tier.findUnique({ where: { slug } }) : null;
    const artworks = await prisma.artwork.findMany({
      where: { ...(tier ? { tierId: tier.id } : {}), ...(status ? { status } : {}) },
      include: { tier: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    const embed = baseEmbed("🖼️ 계정 재고 목록 (최근 25개)");
    if (artworks.length === 0) embed.setDescription("조건에 맞는 재고가 없습니다.");
    for (const a of artworks) {
      embed.addFields({ name: `${a.code} · ${a.tier.name}`, value: `${a.title} · ${a.category} · ${a.status}` });
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
