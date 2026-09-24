import type { AutocompleteInteraction } from "discord.js";
import { prisma } from "@/lib/prisma";
import { RAFFLE_STATUS } from "@/lib/constants";

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

export async function openRaffleAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toString();
  const raffles = await prisma.raffleEvent.findMany({
    where: { status: RAFFLE_STATUS.OPEN },
    orderBy: { createdAt: "desc" },
  });
  const filtered = raffles.filter((r) => r.title.includes(focused)).slice(0, 25);
  await interaction.respond(filtered.map((r) => ({ name: r.title, value: r.id })));
}
