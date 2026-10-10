import { Client, GatewayIntentBits, Events, PermissionFlagsBits, type Interaction } from "discord.js";
import { BOT_TOKEN } from "@/bot/env";
import { commandsByName } from "@/bot/commandRegistry";
import { ADMIN_LINK_MODAL_ID, handleAdminLinkModalSubmit } from "@/bot/commands/adminLink";
import {
  TOPUP_MODAL_ID,
  ANSWER_MODAL_PREFIX,
  PARTNER_WEBHOOK_MODAL_ID,
  PARTNER_APPLY_MODAL_ID,
  PARTNER_PROMO_MODAL_ID,
  REFERRAL_REGISTER_MODAL_ID,
  QUANTITY_BUY_MODAL_PREFIX,
  SHOP_PURCHASE_MODAL_PREFIX,
  handleTopUpModalSubmit,
  handleAnswerModalSubmit,
  handlePartnerWebhookModalSubmit,
  handlePartnerApplyModalSubmit,
  handlePartnerPromoModalSubmit,
  handleReferralRegisterModalSubmit,
  handleQuantityBuyModalSubmit,
  handleShopPurchaseModalSubmit,
} from "@/bot/interactions/modals";
import { SHOP_OAUTH_MODAL_ID, handleShopOAuthModalSubmit } from "@/bot/commands/shopOAuthSetup";
import { SELLER_APPLY_MODAL_ID, handleSellerApplyModalSubmit } from "@/bot/commands/sellerApply";
import { SELLER_PRODUCT_MODAL_ID, handleSellerProductModalSubmit } from "@/bot/commands/sellerProduct";
import { SELLER_REPORT_MODAL_PREFIX, handleSellerReportModalSubmit } from "@/bot/sellerTicketHandlers";
import { SELLER_EDIT_INFO_MODAL_ID, handleSellerEditInfoModalSubmit } from "@/bot/sellerPanelHandlers";
import { handleButtonInteraction } from "@/bot/interactions/buttons";
import { handleSelectMenuInteraction } from "@/bot/interactions/selects";
import { panelError, ephemeral } from "@/bot/ui";
import { startStatsChannelLoop } from "@/bot/statsChannels";
import { handleAutoDeleteMessage } from "@/bot/autoDeleteChannel";
import { handleAntiSpamMessage, handleAntiSpamMemberJoin } from "@/bot/antiSpam";
import { handleStickyMessage } from "@/bot/stickyMessage";
import { startPartnerBroadcastLoop } from "@/bot/partnerBroadcast";
import { startDailyStatsBroadcastLoop } from "@/bot/dailyStatsBroadcast";
import { startRaffleAutoCloseLoop } from "@/bot/raffleAutoClose";
import { startPublicStatsLoop } from "@/bot/publicStatsLoop";
import { startRestockCheckLoop } from "@/bot/restockLoop";
import { startStaleRequestsLoop } from "@/bot/staleRequestsLoop";
import { startAdminDutyPanelLoop, updateAdminDutyPanel } from "@/bot/adminDutyPanel";
import { syncAdminDutyFromPresence } from "@/lib/adminDuty";
import { runForGuild, resolveShopByGuildId } from "@/lib/shop";
import { startShopBillingLoop } from "@/bot/shopBillingLoop";
import { startSellerBillingLoop } from "@/bot/sellerBillingLoop";
import { ensureShopSubscriptionTier } from "@/lib/orders";
import { migrateAllTenantDbs } from "@/lib/provisionShop";
import { startPromoInviteTracking } from "@/bot/promoInviteTracking";
import { startPromoStaffWeeklyReportLoop } from "@/bot/promoStaffWeeklyReport";
import { startServerBackupLoop } from "@/bot/serverBackup";
import { startServerRestoreLoop } from "@/bot/serverRestore";

// 관리자 근무 현황 자동 감지(온라인=출근/오프라인=일시중지)에는 Presence Intent가 필요하다.
// 서버 백업(메시지 내용까지)에는 Message Content Intent가 필요하다. 디스코드 개발자
// 포털 > Bot > Privileged Gateway Intents에서 "PRESENCE INTENT"와 "MESSAGE CONTENT
// INTENT"를 켜지 않으면 각각 presenceUpdate 이벤트를 못 받거나(자동 근무감지만 동작
// 안 함) 메시지 내용이 빈 문자열로만 보인다(백업 시 메시지 본문이 비어서 저장됨).
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ 자비샵 봇 로그인 완료: ${c.user.tag}`);
  // 봇 재시작마다 모든 테넌트 DB를 메인 스키마 최신 상태로 맞춘다 - 샵 생성 시 한 번만
  // 마이그레이션하고 끝나면 그 뒤로 메인 스키마가 바뀔 때마다 테넌트가 구버전에 멈춰있게
  // 되는 드리프트를 막기 위함 (아래 다른 루프들이 새 컬럼을 건드리기 전에 끝나야 해서 await).
  await migrateAllTenantDbs().catch((e) => console.error("테넌트 DB 일괄 마이그레이션 실패:", e));
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
  startSellerBillingLoop();
  startPromoInviteTracking(client).catch((e) => console.error("홍보직원 초대 추적 초기화 실패:", e));
  startPromoStaffWeeklyReportLoop();
  startServerBackupLoop(client);
  startServerRestoreLoop(client);
});

client.on(Events.MessageCreate, (message) => {
  runForGuild(message.guildId, async () => {
    await handleAntiSpamMessage(message).catch((e) => console.error("안티스팸 처리 중 오류:", e));
    await handleAutoDeleteMessage(message).catch(() => {});
    handleStickyMessage(message);
  }).catch((e) => console.error("메시지 처리 중 오류:", e));
});

client.on(Events.GuildMemberAdd, (member) => {
  runForGuild(member.guild.id, () => handleAntiSpamMemberJoin(member)).catch((e) =>
    console.error("안티스팸 부계정 감지 중 오류:", e)
  );
});

client.on(Events.PresenceUpdate, async (_oldPresence, newPresence) => {
  if (!newPresence.userId) return;
  const member = newPresence.member;
  if (!member || member.user.bot) return;

  const guildId = member.guild.id;
  const isOwnGuild = guildId === process.env.DISCORD_GUILD_ID;
  if (!isOwnGuild) {
    // 연동 안 된(또는 비활성) 서버에서 온 presence 변화는 무시한다 - 그 외(자비샵 본인
    // 서버 또는 연동된 테넌트 서버)는 관리자 근무 현황 자동감지를 그대로 적용한다.
    const shop = await resolveShopByGuildId(guildId);
    if (!shop || shop.status !== "ACTIVE") return;
  }

  // 테넌트 서버는 자비샵 전용 커스텀 역할(DISCORD_ADMIN_ROLE_ID) 개념이 없으니
  // Administrator 권한 여부만 본다.
  const adminRoleId = isOwnGuild ? process.env.DISCORD_ADMIN_ROLE_ID : undefined;
  const isAdminRole =
    (adminRoleId && member.roles.cache.has(adminRoleId)) || member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdminRole) return;

  const isOnline = newPresence.status !== "offline";
  await runForGuild(guildId, async () => {
    const changed = await syncAdminDutyFromPresence(member.id, member.displayName, isOnline);
    if (changed) await updateAdminDutyPanel(client).catch(() => {});
  }).catch((e) => console.error("관리자 근무 상태 자동 감지 실패:", e));
});

client.on(Events.InteractionCreate, async (interaction) => {
  const guildId = interaction.guildId;
  // 자비샵 본인 서버가 아닌 다른 서버는, 그 서버가 실제로 어떤 샵과 연동되어 있을
  // 때만 그 샵의 전용 DB로 동작해야 한다. 그렇지 않으면(아직 /샵연동을 안 한 새
  // 서버) resolveShopByGuildId가 null을 반환해서 runForGuild가 그냥 fn()을 그대로
  // 호출해버리는데, 이러면 자비샵 본인의 실제 운영 DB를 그대로 써버리게 된다 -
  // 즉 "샵 연동을 안 해도 (자비샵 데이터로) 그냥 써지는" 심각한 버그였다.
  // /샵연동 자체는 서버가 아직 연동 안 된 상태에서 실행하는 게 정상이므로 예외로 둔다.
  if (guildId && guildId !== process.env.DISCORD_GUILD_ID) {
    const commandName = interaction.isChatInputCommand() ? interaction.commandName : null;
    if (commandName !== "샵연동") {
      const shop = await resolveShopByGuildId(guildId);
      if (!shop || shop.status !== "ACTIVE") {
        if (interaction.isRepliable()) {
          await interaction
            .reply(ephemeral(panelError("이 서버는 아직 샵과 연동되지 않았습니다. 구매 시 받은 샵 코드로 `/샵연동`을 먼저 실행해주세요.")))
            .catch(() => {});
        }
        return;
      }
    }
  }
  await runForGuild(guildId, () => handleInteraction(interaction));
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
      if (interaction.customId.startsWith(`${SHOP_OAUTH_MODAL_ID}:`)) {
        return handleShopOAuthModalSubmit(interaction, interaction.customId.slice(`${SHOP_OAUTH_MODAL_ID}:`.length));
      }
      if (interaction.customId.startsWith(SHOP_PURCHASE_MODAL_PREFIX)) {
        return handleShopPurchaseModalSubmit(interaction, interaction.customId.slice(SHOP_PURCHASE_MODAL_PREFIX.length));
      }
      if (interaction.customId === SELLER_APPLY_MODAL_ID) return handleSellerApplyModalSubmit(interaction);
      if (interaction.customId === SELLER_PRODUCT_MODAL_ID) return handleSellerProductModalSubmit(interaction);
      if (interaction.customId.startsWith(SELLER_REPORT_MODAL_PREFIX)) {
        return handleSellerReportModalSubmit(interaction, interaction.customId.slice(SELLER_REPORT_MODAL_PREFIX.length));
      }
      if (interaction.customId === SELLER_EDIT_INFO_MODAL_ID) return handleSellerEditInfoModalSubmit(interaction);
      return;
    }
  } catch (err) {
    console.error(`인터랙션 처리 중 오류 (${interaction.type}):`, err);
    const message = err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.";

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(panelError(message)).catch(() => {});
      } else {
        await interaction.reply(ephemeral(panelError(message))).catch(() => {});
      }
    }
  }
}

client.login(BOT_TOKEN);
