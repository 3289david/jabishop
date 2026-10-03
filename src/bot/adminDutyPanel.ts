import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, type Client } from "discord.js";
import { prisma } from "@/lib/prisma";
import { baseEmbed } from "@/bot/format";
import { listAdminDutyStatuses, reconcileAdminDutyRoster, DUTY_STATUS_LABEL } from "@/lib/adminDuty";
import { ADMIN_DUTY_STATUS } from "@/lib/constants";

/**
 * 지금 디스코드 서버에서 관리자 역할(DISCORD_ADMIN_ROLE_ID) 또는 Administrator 권한을
 * 가진 멤버 목록을 가져온다. 웹 관리자 계정(AdminUser) 연동 여부와 무관하다.
 */
export async function fetchAdminRoleMembers(client: Client): Promise<{ discordId: string; name: string }[]> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return [];

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return [];

  await guild.members.fetch().catch(() => {});
  const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;

  const members = guild.members.cache.filter(
    (m) =>
      !m.user.bot &&
      ((adminRoleId && m.roles.cache.has(adminRoleId)) || m.permissions.has(PermissionFlagsBits.Administrator))
  );
  return members.map((m) => ({ discordId: m.id, name: m.displayName }));
}

/** 등록된 관리자(역할 보유자) 전원의 근무 상태 현황판. */
export async function adminDutyStatusEmbed() {
  const admins = await listAdminDutyStatuses();
  const embed = baseEmbed("👮 관리자 근무 현황");
  if (admins.length === 0) {
    embed.setDescription("관리자 역할을 가진 멤버가 없습니다.");
    return embed;
  }

  for (const admin of admins) {
    const label = DUTY_STATUS_LABEL[admin.status] ?? admin.status;
    const since = `<t:${Math.floor(admin.updatedAt.getTime() / 1000)}:R>`;
    embed.addFields({ name: admin.name, value: `${label} · ${since}`, inline: true });
  }
  return embed;
}

/** 관리자가 자기 상태를 직접 바꾸는 버튼 패널 (메시지는 고정, 관리자 역할 보유자만 사용 가능). */
export function adminDutyControlRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`dutystatus:${ADMIN_DUTY_STATUS.ON_DUTY}`).setLabel("🟢 출근").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`dutystatus:${ADMIN_DUTY_STATUS.PAUSED}`).setLabel("🟡 일시중지").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dutystatus:${ADMIN_DUTY_STATUS.OFF_DUTY}`).setLabel("🔴 퇴근").setStyle(ButtonStyle.Danger)
  );
}

/** 근무 현황판 메시지를 최신 상태로 편집한다 (presence 변화마다, 그리고 주기적으로도 호출). */
export async function updateAdminDutyPanel(client: Client) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.adminDutyChannelId || !settings.adminDutyMessageId) return;

  const channel = await client.channels.fetch(settings.adminDutyChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) return;

  const message = await channel.messages.fetch(settings.adminDutyMessageId).catch(() => null);
  if (!message) return;

  const embed = await adminDutyStatusEmbed();
  await message.edit({ embeds: [embed] }).catch(() => {});
}

const PANEL_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // presence 이벤트를 놓쳐도 5분마다 다시 맞춰준다

/** 역할 보유자 명단을 디스코드 기준으로 다시 맞추고(새로 역할 받은 사람 등록/뺏긴 사람 제거), 패널도 갱신한다. */
export async function reconcileAndUpdateAdminDutyPanel(client: Client) {
  const members = await fetchAdminRoleMembers(client);
  await reconcileAdminDutyRoster(members);
  await updateAdminDutyPanel(client);
}

export function startAdminDutyPanelLoop(client: Client) {
  reconcileAndUpdateAdminDutyPanel(client).catch((e) => console.error("관리자 근무 현황판 초기 갱신 실패:", e));
  setInterval(() => {
    reconcileAndUpdateAdminDutyPanel(client).catch((e) => console.error("관리자 근무 현황판 갱신 실패:", e));
  }, PANEL_REFRESH_INTERVAL_MS);
}
