import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client } from "discord.js";
import { prisma } from "@/lib/prisma";
import { baseEmbed } from "@/bot/format";
import { listAdminDutyStatuses, DUTY_STATUS_LABEL } from "@/lib/adminDuty";
import { ADMIN_DUTY_STATUS } from "@/lib/constants";

/** 등록된 관리자 전원의 근무 상태 현황판. */
export async function adminDutyStatusEmbed() {
  const admins = await listAdminDutyStatuses();
  const embed = baseEmbed("👮 관리자 근무 현황");
  if (admins.length === 0) {
    embed.setDescription("등록된 관리자가 없습니다.");
    return embed;
  }

  for (const admin of admins) {
    const label = DUTY_STATUS_LABEL[admin.dutyStatus] ?? admin.dutyStatus;
    const since = admin.dutyStatusUpdatedAt
      ? `<t:${Math.floor(admin.dutyStatusUpdatedAt.getTime() / 1000)}:R>`
      : "-";
    embed.addFields({ name: `${admin.name} (${admin.loginId})`, value: `${label} · ${since}`, inline: true });
  }
  return embed;
}

/** 관리자가 자기 상태를 직접 바꾸는 버튼 패널 (메시지는 고정, 버튼은 누구나 - 연동된 관리자만 - 누를 수 있음). */
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

export function startAdminDutyPanelLoop(client: Client) {
  updateAdminDutyPanel(client).catch((e) => console.error("관리자 근무 현황판 초기 갱신 실패:", e));
  setInterval(() => {
    updateAdminDutyPanel(client).catch((e) => console.error("관리자 근무 현황판 갱신 실패:", e));
  }, PANEL_REFRESH_INTERVAL_MS);
}
