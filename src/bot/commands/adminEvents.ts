import { SlashCommandBuilder, ChannelType, type TextChannel } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed, successEmbed } from "@/bot/format";
import { tierAutocomplete, openRaffleAutocomplete } from "@/bot/autocomplete";
import { createRaffleEvent, attachRaffleMessage, drawRaffleWinners, RaffleError } from "@/lib/raffles";
import { raffleEventEmbed, raffleEventRow } from "@/bot/raffleUI";
import { announceRaffleResult } from "@/bot/raffleAnnounce";
import type { BotCommand } from "@/bot/types";

export const eventCreateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("이벤트생성")
    .setDescription("[관리자] 서버 태그 착용자 대상 상품 추첨 이벤트를 만듭니다.")
    .addStringOption((o) => o.setName("제목").setDescription("이벤트 제목").setRequired(true))
    .addStringOption((o) => o.setName("상품").setDescription("추첨으로 지급할 상품").setRequired(true).setAutocomplete(true))
    .addChannelOption((o) =>
      o.setName("채널").setDescription("이벤트 패널을 게시할 채널").setRequired(true).addChannelTypes(ChannelType.GuildText)
    )
    .addIntegerOption((o) => o.setName("당첨자수").setDescription("당첨자 수 (비우면 1명)").setMinValue(1))
    .addIntegerOption((o) =>
      o.setName("마감시간분").setDescription("지정한 분 뒤 자동 마감/추첨 (비우면 관리자가 /이벤트마감추첨으로 직접 마감)").setMinValue(1)
    )
    .addStringOption((o) => o.setName("설명").setDescription("이벤트 설명")),
  autocomplete: tierAutocomplete,
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString("제목", true);
    const tierSlug = interaction.options.getString("상품", true);
    const channelOption = interaction.options.getChannel("채널", true);
    const winnerCount = interaction.options.getInteger("당첨자수") ?? 1;
    const closesInMinutes = interaction.options.getInteger("마감시간분");
    const description = interaction.options.getString("설명") ?? undefined;

    const tier = await prisma.tier.findUnique({ where: { slug: tierSlug } });
    if (!tier) return interaction.editReply({ embeds: [errorEmbed("존재하지 않는 상품입니다.")] });

    const channel = await interaction.guild?.channels.fetch(channelOption.id).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return interaction.editReply({ embeds: [errorEmbed("텍스트 채널만 선택할 수 있습니다.")] });
    }

    let raffle;
    try {
      raffle = await createRaffleEvent({
        title,
        description,
        tierId: tier.id,
        channelId: channel.id,
        winnerCount,
        closesAt: closesInMinutes ? new Date(Date.now() + closesInMinutes * 60 * 1000) : undefined,
        createdByAdminId: admin.id,
      });
    } catch (e) {
      const message = e instanceof RaffleError ? e.message : "이벤트 생성 중 오류가 발생했습니다.";
      return interaction.editReply({ embeds: [errorEmbed(message)] });
    }

    const message = await (channel as TextChannel).send({
      embeds: [raffleEventEmbed({ ...raffle, tier }, 0)],
      components: [raffleEventRow(raffle.id)],
    });
    await attachRaffleMessage(raffle.id, message.id);

    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "RAFFLE_CREATE", target: raffle.id, detail: title } });
    await interaction.editReply({ embeds: [successEmbed(`이벤트가 생성되어 <#${channel.id}> 채널에 게시되었습니다.`)] });
  },
};

export const eventDrawCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("이벤트마감추첨")
    .setDescription("[관리자] 진행 중인 이벤트를 마감하고 당첨자를 추첨합니다.")
    .addStringOption((o) => o.setName("이벤트").setDescription("마감할 이벤트").setRequired(true).setAutocomplete(true)),
  autocomplete: openRaffleAutocomplete,
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const raffleId = interaction.options.getString("이벤트", true);

    let result;
    try {
      result = await drawRaffleWinners(raffleId);
    } catch (e) {
      const message = e instanceof RaffleError ? e.message : "추첨 중 오류가 발생했습니다.";
      return interaction.editReply({ embeds: [errorEmbed(message)] });
    }

    await announceRaffleResult(interaction.client, result.raffle, result.winners, result.entryCount);

    await prisma.adminActivityLog.create({
      data: { adminId: admin.id, action: "RAFFLE_DRAW", target: raffleId, detail: `당첨자 ${result.winners.length}명 / 참가자 ${result.entryCount}명` },
    });

    const failedCount = result.winners.filter((w) => w.grantFailed).length;
    const summary = [
      `추첨 완료! 참가자 ${result.entryCount}명 중 ${result.winners.length}명 당첨.`,
      failedCount > 0 ? `⚠️ ${failedCount}명은 재고 부족으로 자동 지급에 실패했습니다. /계정지급으로 수동 지급해주세요.` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await interaction.editReply({ embeds: [successEmbed(summary)] });
  },
};
