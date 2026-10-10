import { SlashCommandBuilder } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { panelError, panelSuccess } from "@/bot/ui";
import { tierAutocomplete } from "@/bot/autocomplete";
import { createFlashSale, cancelFlashSale, EventError } from "@/lib/events/flashSale";
import type { BotCommand } from "@/bot/types";

export const flashSaleCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("타임세일생성")
    .setDescription("[관리자] 특정 등급에 한시적 할인(타임세일)을 시작합니다.")
    .addStringOption((o) => o.setName("등급").setDescription("세일할 등급").setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName("할인율").setDescription("할인율 (1~100%)").setRequired(true).setMinValue(1).setMaxValue(100))
    .addIntegerOption((o) => o.setName("지속시간분").setDescription("지금부터 몇 분 동안 진행할지").setRequired(true).setMinValue(1)),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급", true);
    const discountPercent = interaction.options.getInteger("할인율", true);
    const durationMinutes = interaction.options.getInteger("지속시간분", true);
    await interaction.deferReply({ ephemeral: true });

    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.editReply(panelError("존재하지 않는 등급입니다."));

    try {
      const sale = await createFlashSale({ tierId: tier.id, discountPercent, durationMinutes, adminId: admin.id });
      await prisma.adminActivityLog.create({
        data: { adminId: admin.id, action: "FLASH_SALE_CREATE", target: sale.id, detail: `${tier.name} ${discountPercent}% ${durationMinutes}분` },
      });
      await interaction.editReply(
        panelSuccess(
          `"${tier.name}" 등급에 ${discountPercent}% 타임세일을 시작했습니다. <t:${Math.floor(sale.endsAt.getTime() / 1000)}:R>까지 진행됩니다.\n(전체 타임세일 기능이 꺼져 있으면 /설정수정에서 "타임세일이벤트" 옵션을 켜야 실제로 적용됩니다.)`
        )
      );
    } catch (e) {
      const message = e instanceof EventError ? e.message : "타임세일 생성 중 오류가 발생했습니다.";
      await interaction.editReply(panelError(message));
    }
  },
};

export const flashSaleCancelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("타임세일취소")
    .setDescription("[관리자] 진행 중인 타임세일을 즉시 종료합니다.")
    .addStringOption((o) => o.setName("등급").setDescription("취소할 등급").setRequired(true).setAutocomplete(true)),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const slug = interaction.options.getString("등급", true);
    await interaction.deferReply({ ephemeral: true });

    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) return interaction.editReply(panelError("존재하지 않는 등급입니다."));

    const count = await cancelFlashSale(tier.id);
    if (count === 0) {
      return interaction.editReply(panelError(`"${tier.name}" 등급에 진행 중인 타임세일이 없습니다.`));
    }

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "FLASH_SALE_CANCEL", target: tier.id } });
    await interaction.editReply(panelSuccess(`"${tier.name}" 등급의 타임세일을 종료했습니다.`));
  },
};
