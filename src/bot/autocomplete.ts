import type { AutocompleteInteraction } from "discord.js";
import { prisma } from "@/lib/prisma";

export async function tierAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toString();
  const tiers = await prisma.tier.findMany({ orderBy: { sortOrder: "asc" } });
  const filtered = tiers
    .filter((t) => t.name.includes(focused) || t.slug.includes(focused))
    .slice(0, 25);
  await interaction.respond(
    filtered.map((t) => ({ name: `${t.name} (${t.price.toLocaleString()}원)`, value: t.slug }))
  );
}
