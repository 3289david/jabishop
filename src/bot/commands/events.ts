import { SlashCommandBuilder, ChannelType, type TextChannel } from "discord.js";
import { assertActiveShopUser, requireLinkedAdmin } from "@/bot/discordAuth";
import { errorEmbed, successEmbed, baseEmbed, pt } from "@/bot/format";
import { performCheckIn, EventError as CheckInError } from "@/lib/events/checkin";
import { getOrCreateReferralCode, linkReferral, EventError as ReferralError } from "@/lib/events/referral";
import { spinGacha, EventError as GachaError } from "@/lib/events/gacha";
import { eventPanelEmbed, eventPanelRows, eventPromoEmbed } from "@/bot/panels";
import type { BotCommand } from "@/bot/types";

export const eventPanelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("이벤트패널")
    .setDescription("[관리자] 버튼으로 이벤트(출석체크/친구초대/룰렛)에 참여할 수 있는 패널을 엽니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    await interaction.reply({ embeds: [await eventPanelEmbed()], components: await eventPanelRows() });
  },
};

export const eventPromoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("이벤트홍보")
    .setDescription("[관리자] 신규 이벤트 4종을 소개하는 홍보 공지를 채널에 올립니다 (패널과는 별개).")
    .addChannelOption((o) =>
      o.setName("채널").setDescription("홍보 공지를 올릴 채널").setRequired(true).addChannelTypes(ChannelType.GuildText)
    ),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    const channelOption = interaction.options.getChannel("채널", true);
    await interaction.deferReply({ ephemeral: true });

    const channel = await interaction.guild?.channels.fetch(channelOption.id).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      return interaction.editReply({ embeds: [errorEmbed("텍스트 채널만 선택할 수 있습니다.")] });
    }

    await (channel as TextChannel).send({ embeds: [eventPromoEmbed()] });
    await interaction.editReply({ embeds: [successEmbed(`<#${channel.id}> 채널에 이벤트 홍보 공지를 올렸습니다.`)] });
  },
};

export const checkInCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("출석체크").setDescription("하루 1회 출석체크하고 포인트를 받습니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    try {
      const result = await performCheckIn(user.id);
      await interaction.reply({
        embeds: [
          successEmbed(`출석체크 완료! +${pt(result.reward)}`).addFields(
            { name: "연속 출석", value: `${result.streak}일차`, inline: true },
            { name: "보유 포인트", value: pt(result.balance), inline: true }
          ),
        ],
        ephemeral: true,
      });
    } catch (e) {
      const message = e instanceof CheckInError ? e.message : "출석체크 중 오류가 발생했습니다.";
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  },
};

export const referralCodeCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("초대코드").setDescription("내 친구 초대코드를 확인합니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    try {
      const code = await getOrCreateReferralCode(user.id);
      await interaction.reply({
        embeds: [
          baseEmbed("🎁 내 초대코드").setDescription(
            `\`${code}\`\n\n친구가 이 코드를 \`/초대코드등록\`으로 입력하면 **나는 즉시 200P**,\n친구가 첫 구매를 완료하면 **나는 800P 추가**(총 1,000P) + **친구는 500P**를 받아요!`
          ),
        ],
        ephemeral: true,
      });
    } catch (e) {
      const message = e instanceof ReferralError ? e.message : "처리 중 오류가 발생했습니다.";
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  },
};

export const referralRegisterCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("초대코드등록")
    .setDescription("친구의 초대코드를 등록합니다 (구매 이력이 없는 신규 회원만 가능).")
    .addStringOption((o) => o.setName("코드").setDescription("친구의 초대코드").setRequired(true)),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const code = interaction.options.getString("코드", true);
    try {
      const referrer = await linkReferral(user.id, code);
      await interaction.reply({
        embeds: [
          successEmbed(
            `초대코드가 등록되었습니다! ${referrer.name}님에게 등록 보상 200P가 지급됐어요.\n첫 구매를 완료하면 나에게 500P, ${referrer.name}님에게 800P가 추가로 지급됩니다.`
          ),
        ],
        ephemeral: true,
      });
    } catch (e) {
      const message = e instanceof ReferralError ? e.message : "처리 중 오류가 발생했습니다.";
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  },
};

export const gachaSpinCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("룰렛돌리기").setDescription("포인트를 내고 룰렛을 돌려 랜덤 보상을 받습니다."),
  async execute(interaction) {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    try {
      const result = await spinGacha(user.id);
      const embed =
        result.prize.kind === "NONE"
          ? errorEmbed(`꽝! ${pt(result.cost)}를 소모했습니다. 다음 기회에 도전해보세요.`)
          : successEmbed(`🎉 ${result.prize.label} 당첨!`);
      embed.addFields({ name: "보유 포인트", value: pt(result.balance), inline: true });
      if (result.couponCode) {
        embed.addFields({ name: "쿠폰 코드", value: `\`${result.couponCode}\` (쿠폰함에서 확인 가능)` });
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
      const message = e instanceof GachaError ? e.message : "룰렛 진행 중 오류가 발생했습니다.";
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  },
};
