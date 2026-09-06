import { Client, GatewayIntentBits, Events, MessageFlags } from "discord.js";
import { BOT_TOKEN } from "@/bot/env";
import { commandsByName } from "@/bot/commandRegistry";
import { ADMIN_LINK_MODAL_ID, handleAdminLinkModalSubmit } from "@/bot/commands/adminLink";
import {
  TOPUP_MODAL_ID,
  INQUIRY_MODAL_ID,
  ANSWER_MODAL_PREFIX,
  handleTopUpModalSubmit,
  handleInquiryModalSubmit,
  handleAnswerModalSubmit,
} from "@/bot/interactions/modals";
import { handleButtonInteraction } from "@/bot/interactions/buttons";
import { handleSelectMenuInteraction } from "@/bot/interactions/selects";
import { errorEmbed } from "@/bot/format";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ 자비샵 봇 로그인 완료: ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
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
});

client.login(BOT_TOKEN);
