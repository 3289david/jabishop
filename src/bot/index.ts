import { Client, GatewayIntentBits, Events, MessageFlags, PermissionFlagsBits, type Interaction } from "discord.js";
import { BOT_TOKEN } from "@/bot/env";
import { commandsByName } from "@/bot/commandRegistry";
import { ADMIN_LINK_MODAL_ID, handleAdminLinkModalSubmit } from "@/bot/commands/adminLink";
import {
  TOPUP_MODAL_ID,
  INQUIRY_MODAL_ID,
  ANSWER_MODAL_PREFIX,
  PARTNER_WEBHOOK_MODAL_ID,
  PARTNER_APPLY_MODAL_ID,
  PARTNER_PROMO_MODAL_ID,
  REFERRAL_REGISTER_MODAL_ID,
  QUANTITY_BUY_MODAL_PREFIX,
  handleTopUpModalSubmit,
  handleInquiryModalSubmit,
  handleAnswerModalSubmit,
  handlePartnerWebhookModalSubmit,
  handlePartnerApplyModalSubmit,
  handlePartnerPromoModalSubmit,
  handleReferralRegisterModalSubmit,
  handleQuantityBuyModalSubmit,
} from "@/bot/interactions/modals";
import { handleButtonInteraction } from "@/bot/interactions/buttons";
import { handleSelectMenuInteraction } from "@/bot/interactions/selects";
import { errorEmbed } from "@/bot/format";
import { startStatsChannelLoop } from "@/bot/statsChannels";
import { handleAutoDeleteMessage } from "@/bot/autoDeleteChannel";
import { handleStickyMessage } from "@/bot/stickyMessage";
import { startPartnerBroadcastLoop } from "@/bot/partnerBroadcast";
import { startDailyStatsBroadcastLoop } from "@/bot/dailyStatsBroadcast";
import { startRaffleAutoCloseLoop } from "@/bot/raffleAutoClose";
import { startPublicStatsLoop } from "@/bot/publicStatsLoop";
import { startRestockCheckLoop } from "@/bot/restockLoop";
import { startStaleRequestsLoop } from "@/bot/staleRequestsLoop";
import { startAdminDutyPanelLoop, updateAdminDutyPanel } from "@/bot/adminDutyPanel";
import { syncAdminDutyFromPresence } from "@/lib/adminDuty";
import { runForGuild } from "@/lib/shop";
import { startShopBillingLoop } from "@/bot/shopBillingLoop";
import { ensureShopSubscriptionTier } from "@/lib/orders";

// 관리자 근무 현황 자동 감지(온라인=출근/오프라인=일시중지)에는 Presence Intent가 필요하다.
// 디스코드 개발자 포털 > Bot > Privileged Gateway Intents에서 "PRESENCE INTENT"를 켜지
// 않으면 이 봇은 presenceUpdate 이벤트 자체를 받지 못한다 (자동 감지만 동작 안 함,
// 수동 출근/퇴근/일시중지 버튼 패널은 이 설정과 무관하게 항상 동작한다).
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ 자비샵 봇 로그인 완료: ${c.user.tag}`);
  // "자판기 통째로 구매" 상품은 자비샵 본인 DB에만 있어야 한다(테넌트 샵이 또 자판기를
  // 되파는 건 지원 범위 밖) - forEachShop 안 쓰고 기본(자비샵 본인) DB에만 생성한다.
  ensureShopSubscriptionTier().catch((e) => console.error("자판기 등급 생성 실패:", e));
  startStatsChannelLoop(client);
  startPartnerBroadcastLoop();
  startDailyStatsBroadcastLoop(client);
  startRaffleAutoCloseLoop(client);
  startPublicStatsLoop(client);
  startRestockCheckLoop();
  startStaleRequestsLoop();
  startAdminDutyPanelLoop(client);
  startShopBillingLoop();
});

client.on(Events.MessageCreate, (message) => {
  runForGuild(message.guildId, async () => {
    await handleAutoDeleteMessage(message).catch(() => {});
    handleStickyMessage(message);
  }).catch((e) => console.error("메시지 처리 중 오류:", e));
});

client.on(Events.PresenceUpdate, (_oldPresence, newPresence) => {
  if (!newPresence.userId) return;
  const member = newPresence.member;
  if (!member || member.user.bot) return;
  // 관리자 근무 현황은 자비샵 본인 서버 전용 기능(DISCORD_ADMIN_ROLE_ID가 길드 하나 기준) -
  // 테넌트 서버에서 온 presence 변화는 무시한다.
  if (member.guild.id !== process.env.DISCORD_GUILD_ID) return;

  const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;
  const isAdminRole =
    (adminRoleId && member.roles.cache.has(adminRoleId)) || member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdminRole) return;

  const isOnline = newPresence.status !== "offline";
  syncAdminDutyFromPresence(member.id, member.displayName, isOnline)
    .then((changed) => {
      if (changed) updateAdminDutyPanel(client).catch(() => {});
    })
    .catch((e) => console.error("관리자 근무 상태 자동 감지 실패:", e));
});

client.on(Events.InteractionCreate, async (interaction) => {
  await runForGuild(interaction.guildId, () => handleInteraction(interaction));
});

async function handleInteraction(interaction: Interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command?.autocomplete) return;
      await command.autocomplete(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === ADMIN_LINK_MODAL_ID) return handleAdminLinkModalSubmit(interaction);
      if (interaction.customId === TOPUP_MODAL_ID) return handleTopUpModalSubmit(interaction);
      if (interaction.customId === INQUIRY_MODAL_ID) return handleInquiryModalSubmit(interaction);
      if (interaction.customId.startsWith(ANSWER_MODAL_PREFIX)) {
        return handleAnswerModalSubmit(interaction, interaction.customId.slice(ANSWER_MODAL_PREFIX.length));
      }
      if (interaction.customId === PARTNER_WEBHOOK_MODAL_ID) return handlePartnerWebhookModalSubmit(interaction);
      if (interaction.customId === PARTNER_APPLY_MODAL_ID) return handlePartnerApplyModalSubmit(interaction);
      if (interaction.customId === PARTNER_PROMO_MODAL_ID) return handlePartnerPromoModalSubmit(interaction);
      if (interaction.customId === REFERRAL_REGISTER_MODAL_ID) return handleReferralRegisterModalSubmit(interaction);
      if (interaction.customId.startsWith(QUANTITY_BUY_MODAL_PREFIX)) {
        return handleQuantityBuyModalSubmit(interaction, interaction.customId.slice(QUANTITY_BUY_MODAL_PREFIX.length));
      }
      return;
    }
  } catch (err) {
    console.error(`인터랙션 처리 중 오류 (${interaction.type}):`, err);
    const message = err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.";

    if (interaction.isRepliable()) {
      const payload = { embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral } as const;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed(message)] }).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
}

client.login(BOT_TOKEN);
