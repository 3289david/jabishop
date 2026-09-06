import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { assertActiveShopUser } from "@/bot/discordAuth";
import { baseEmbed, successEmbed } from "@/bot/format";
import { saveBufferToUploads } from "@/bot/fileStorage";
import type { BotCommand } from "@/bot/types";

export const inquiryCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("문의하기")
    .setDescription("1:1 문의를 등록합니다.")
    .addStringOption((o) => o.setName("제목").setDescription("문의 제목").setRequired(true))
    .addStringOption((o) => o.setName("내용").setDescription("문의 내용").setRequired(true).setMaxLength(2000))
    .addAttachmentOption((o) => o.setName("첨부").setDescription("이미지 첨부 (선택)")),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const title = interaction.options.getString("제목", true);
    const content = interaction.options.getString("내용", true);
    const attachment = interaction.options.getAttachment("첨부");
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);

    let images: string[] = [];
    if (attachment) {
      const res = await fetch(attachment.url);
      const buffer = Buffer.from(await res.arrayBuffer());
      const key = await saveBufferToUploads(buffer, attachment.name, "attachments");
      images = [key];
    }

    const inquiry = await prisma.inquiry.create({
      data: { userId: user.id, title, content, images: images.length ? JSON.stringify(images) : null },
    });
    await interaction.editReply({ embeds: [successEmbed(`문의가 등록되었습니다. (ID: ${inquiry.id.slice(-8)})`)] });
  },
};

export const inquiryListCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("문의내역").setDescription("내 문의 내역을 확인합니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const inquiries = await prisma.inquiry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const embed = baseEmbed("💬 내 문의 내역");
    if (inquiries.length === 0) embed.setDescription("문의 내역이 없습니다.");
    for (const i of inquiries) {
      embed.addFields({
        name: `${i.title} (${i.status})`,
        value: i.answer ? `답변: ${i.answer.slice(0, 200)}` : "답변 대기중",
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
