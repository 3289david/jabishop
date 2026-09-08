import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { getOrCreateShopUser } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const couponCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("쿠폰생성")
    .setDescription("[관리자] 새 쿠폰을 생성합니다.")
    .addStringOption((o) => o.setName("코드").setDescription("쿠폰 코드").setRequired(true))
    .addStringOption((o) => o.setName("이름").setDescription("쿠폰 이름").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("할인유형")
        .setDescription("할인 방식")
        .setRequired(true)
        .addChoices({ name: "정액(원)", value: "AMOUNT" }, { name: "정률(%)", value: "RATE" })
    )
    .addIntegerOption((o) => o.setName("할인값").setDescription("할인 금액 또는 %").setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o.setName("유효일수").setDescription("오늘부터 며칠간 유효한지").setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o.setName("최소주문금액").setDescription("최소 주문 금액"))
    .addIntegerOption((o) => o.setName("전체사용제한").setDescription("전체 사용 가능 횟수")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const code = interaction.options.getString("코드", true).toUpperCase();
    const name = interaction.options.getString("이름", true);
    const discountType = interaction.options.getString("할인유형", true);
    const discountValue = interaction.options.getInteger("할인값", true);
    const validDays = interaction.options.getInteger("유효일수", true);
    const minOrderAmount = interaction.options.getInteger("최소주문금액") ?? 0;
    const usageLimitTotal = interaction.options.getInteger("전체사용제한");

    if (await prisma.coupon.findUnique({ where: { code } })) {
      return interaction.reply({ embeds: [errorEmbed("이미 존재하는 쿠폰 코드입니다.")], ephemeral: true });
    }

    const validFrom = new Date();
    const validTo = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

    const coupon = await prisma.coupon.create({
      data: { code, name, discountType, discountValue, minOrderAmount, usageLimitTotal, validFrom, validTo },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "COUPON_CREATE", target: coupon.id, detail: code } });
    await interaction.reply({ embeds: [successEmbed(`쿠폰 "${code}"가 생성되었습니다. (~${validTo.toLocaleDateString("ko-KR")})`)], ephemeral: true });
  },
};

export const couponListAdminCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("쿠폰목록").setDescription("[관리자] 전체 쿠폰 목록을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { _count: { select: { usages: true } } } });
    const embed = baseEmbed("🎟️ 쿠폰 목록");
    for (const c of coupons) {
      const value = c.discountType === "RATE" ? `${c.discountValue}%` : `${c.discountValue.toLocaleString()}원`;
      embed.addFields({
        name: `${c.code} (${c.active ? "사용중" : "중지"})`,
        value: `${c.name} · ${value} 할인 · 사용 ${c._count.usages}${c.usageLimitTotal ? `/${c.usageLimitTotal}` : ""}회`,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export const couponIssueCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("쿠폰지급")
    .setDescription("[관리자] 회원에게 쿠폰을 지급합니다.")
    .addStringOption((o) => o.setName("코드").setDescription("지급할 쿠폰 코드").setRequired(true))
    .addUserOption((o) => o.setName("대상").setDescription("지급받을 디스코드 사용자 (전체 지급 시 생략)"))
    .addBooleanOption((o) => o.setName("전체").setDescription("모든 회원에게 지급할지 여부")),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const code = interaction.options.getString("코드", true).toUpperCase();
    const target = interaction.options.getUser("대상");
    const toAll = interaction.options.getBoolean("전체") ?? false;

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 쿠폰 코드입니다.")], ephemeral: true });

    if (toAll) {
      await interaction.deferReply({ ephemeral: true });
      const users = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      for (const u of users) {
        await prisma.userCoupon.upsert({
          where: { userId_couponId: { userId: u.id, couponId: coupon.id } },
          update: {},
          create: { userId: u.id, couponId: coupon.id },
        });
      }
      if (users.length > 0) {
        await prisma.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            type: "COUPON_ISSUED",
            title: "쿠폰 지급",
            message: `"${coupon.name}" 쿠폰이 지급되었습니다.`,
          })),
        });
      }
      await prisma.adminActivityLog.create({
        data: { adminId: admin.id, action: "COUPON_ISSUE_ALL", target: coupon.id, detail: `${users.length}명` },
      });
      return interaction.editReply({ embeds: [successEmbed(`전체 회원(${users.length}명)에게 "${code}" 쿠폰을 지급했습니다.`)] });
    }

    if (!target) return interaction.reply({ embeds: [errorEmbed("지급 대상을 지정하거나 '전체'를 켜주세요.")], ephemeral: true });

    const user = await getOrCreateShopUser(target.id, target.tag);
    await prisma.userCoupon.upsert({
      where: { userId_couponId: { userId: user.id, couponId: coupon.id } },
      update: {},
      create: { userId: user.id, couponId: coupon.id },
    });
    await prisma.notification.create({
      data: { userId: user.id, type: "COUPON_ISSUED", title: "쿠폰 지급", message: `"${coupon.name}" 쿠폰이 지급되었습니다.` },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "COUPON_ISSUE", target: coupon.id, detail: target.tag } });
    await interaction.reply({ embeds: [successEmbed(`${target.username}님에게 "${code}" 쿠폰을 지급했습니다.`)], ephemeral: true });
  },
};
