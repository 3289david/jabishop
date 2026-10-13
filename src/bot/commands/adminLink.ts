import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ModalSubmitInteraction,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { ADMIN_STATUS } from "@/lib/constants";
import { requireLinkedAdmin, requireSuperRole } from "@/bot/discordAuth";
import { panelError, panelSuccess, ephemeral } from "@/bot/ui";
import type { BotCommand } from "@/bot/types";

export const ADMIN_LINK_MODAL_ID = "admin_link_modal";

export const adminLinkCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("관리자연동")
    .setDescription("관리자 계정을 이 디스코드 계정과 연동합니다."),
  async execute(interaction) {
    const modal = new ModalBuilder().setCustomId(ADMIN_LINK_MODAL_ID).setTitle("관리자 계정 연동");

    const loginIdInput = new TextInputBuilder()
      .setCustomId("loginId")
      .setLabel("관리자 ID")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const passwordInput = new TextInputBuilder()
      .setCustomId("password")
      .setLabel("비밀번호")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const totpInput = new TextInputBuilder()
      .setCustomId("totp")
      .setLabel("2FA 코드 (사용 중일 때만 입력)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(loginIdInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(totpInput)
    );

    await interaction.showModal(modal);
  },
};

export async function handleAdminLinkModalSubmit(interaction: ModalSubmitInteraction) {
  const loginId = interaction.fields.getTextInputValue("loginId").trim();
  const password = interaction.fields.getTextInputValue("password");
  const totp = interaction.fields.getTextInputValue("totp").trim();

  await interaction.deferReply({ ephemeral: true });

  const admin = await prisma.adminUser.findUnique({ where: { loginId } });
  if (!admin || admin.status !== ADMIN_STATUS.ACTIVE) {
    return interaction.editReply(panelError("아이디 또는 비밀번호가 올바르지 않습니다."));
  }
  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    return interaction.editReply(panelError("아이디 또는 비밀번호가 올바르지 않습니다."));
  }
  if (admin.totpEnabled && admin.totpSecret) {
    if (!totp || !verifyTotp(admin.totpSecret, totp)) {
      return interaction.editReply(panelError("2FA 코드가 올바르지 않습니다."));
    }
  }
  if (admin.discordId && admin.discordId !== interaction.user.id) {
    return interaction.editReply(panelError("이미 다른 디스코드 계정에 연동된 관리자입니다."));
  }

  await prisma.adminUser.update({ where: { id: admin.id }, data: { discordId: interaction.user.id } });
  await prisma.adminActivityLog.create({
    data: { adminId: admin.id, action: "DISCORD_LINK", detail: `@${interaction.user.tag}` },
  });

  await interaction.editReply(panelSuccess(`${admin.loginId} 관리자 계정과 연동되었습니다. 이제 관리자 명령어를 사용할 수 있습니다.`));
}

export const autoAdminRoleCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("관리자자동지정역할")
    .setDescription("[SUPER] 이 역할을 가진 사람이 명령어를 처음 쓸 때 자동으로 관리자가 되게 설정합니다.")
    .addStringOption((o) =>
      o
        .setName("역할id목록")
        .setDescription("자동으로 관리자가 될 역할 ID들 (공백/쉼표로 구분, 비우면 현재 설정을 비움)")
    ),
  async execute(interaction) {
    // 서버 소유자는 어차피 항상 자동으로 SUPER가 되므로, 이 명령어 자체는 서버
    // 소유자(최초 1회) 또는 이미 지정된 다른 SUPER가 실행하면 된다.
    const admin = await requireLinkedAdmin(interaction.user.id, interaction.guild);
    requireSuperRole(admin.role);

    const raw = interaction.options.getString("역할id목록");
    const roleIds = raw
      ? raw
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(",")
      : "";

    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: { autoAdminRoleIds: roleIds },
      create: { id: "singleton", bankName: "", bankAccountNumber: "", bankAccountHolder: "", autoAdminRoleIds: roleIds },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "AUTO_ADMIN_ROLE_UPDATE", detail: roleIds || "(비움)" } });

    await interaction.reply(
      ephemeral(
        panelSuccess(
          roleIds
            ? `이 역할(들)을 가진 사람은 명령어를 처음 쓸 때 자동으로 관리자(MANAGER)가 됩니다: ${roleIds
                .split(",")
                .map((id) => `<@&${id}>`)
                .join(", ")}`
            : "관리자 자동 지정 역할을 비웠습니다."
        )
      )
    );
  },
};
