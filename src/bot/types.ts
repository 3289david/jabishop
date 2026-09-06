import type { ChatInputCommandInteraction, AutocompleteInteraction, ModalSubmitInteraction } from "discord.js";

export interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>;
  modalSubmit?: Record<string, (interaction: ModalSubmitInteraction) => Promise<unknown>>;
}
