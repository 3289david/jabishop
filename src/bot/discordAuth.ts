import { randomBytes } from "node:crypto";
import type { Guild } from "discord.js";
import { prisma } from "@/lib/prisma";
import { USER_STATUS, ADMIN_STATUS, ADMIN_ROLE } from "@/lib/constants";
import { getAppOrigin } from "@/lib/appUrl";
import { hashPassword } from "@/lib/password";

/**
 * 디스코드 사용자는 별도 회원가입 없이 봇 명령어를 처음 사용하는 순간
 * 자동으로 쇼핑몰 회원으로 연결(최초 1회 생성)된다.
 * 이메일/비밀번호 로그인이 없는 대신, discordId 자체가 로그인 수단이다.
 */
export async function getOrCreateShopUser(discordId: string, discordTag: string) {
  let user = await prisma.user.findUnique({ where: { discordId } });
  if (user) return user;

  const email = `discord_${discordId}@jabishop.local`;
  user = await prisma.user.create({
    data: {
      discordId,
      email,
      name: discordTag,
      passwordHash: null,
    },
  });
  return user;
}

export async function assertActiveShopUser(discordId: string, discordTag: string) {
  const user = await getOrCreateShopUser(discordId, discordTag);
  if (user.status === USER_STATUS.SUSPENDED) {
    throw new Error(`이용이 정지된 계정입니다.${user.suspendedReason ? ` (사유: ${user.suspendedReason})` : ""}`);
  }
  if (user.status === USER_STATUS.WITHDRAWN) {
    throw new Error("탈퇴한 계정입니다.");
  }
  return user;
}

/** discordId로 연동된 관리자 계정을 찾는다. 연동 전이거나 비활성 상태면 null. */
export async function getLinkedAdmin(discordId: string) {
  const admin = await prisma.adminUser.findUnique({ where: { discordId } });
  if (!admin || admin.status !== ADMIN_STATUS.ACTIVE) return null;
  return admin;
}

/**
 * 디스코드에서 쓸 임시 로그인 비번(본인은 모름, 로그인은 디스코드 연동으로만 함)을 만들어
 * 해시로 저장한다. 이미 이 discordId로 된 계정이 있으면(예: 관리자가 비활성화해둔 경우)
 * 그 상태를 그대로 존중하고 새로 만들지 않는다 - 안 그러면 loginId/discordId unique
 * 제약에 걸려 에러가 난다.
 */
async function createAutoAdminUser(discordId: string, name: string, role: string) {
  const existing = await prisma.adminUser.findUnique({ where: { discordId } });
  if (existing) return null;

  const randomPassword = randomBytes(24).toString("hex");
  const admin = await prisma.adminUser.create({
    data: {
      loginId: `discord_${discordId}`,
      passwordHash: await hashPassword(randomPassword),
      name,
      role,
      discordId,
    },
  });
  await prisma.adminActivityLog.create({
    data: { adminId: admin.id, action: "DISCORD_AUTO_PROVISION", detail: `@${name} (역할:${role})` },
  });
  return admin;
}

/**
 * 봇 명령어에서 아직 관리자로 연동 안 된 사람이 호출했을 때, guild가 주어져 있으면
 * (1) 그 서버의 소유자(owner)면 즉시 SUPER 관리자로, (2) ShopSetting.autoAdminRoleIds에
 * 지정된 역할을 갖고 있으면 MANAGER 관리자로 자동 발급한다. 자판기(샵)를 산 사람이
 * 웹사이트에 따로 로그인하지 않아도 자기 서버에서 디스코드 명령어만으로 바로 관리자가
 * 될 수 있게 하기 위함 - 예전엔 이 경로가 없어서 아무도 관리자 명령어를 못 썼다.
 */
async function tryAutoProvisionAdmin(discordId: string, guild: Guild | null | undefined) {
  if (!guild) return null;

  if (guild.ownerId === discordId) {
    const owner = await guild.members.fetch(discordId).catch(() => null);
    return createAutoAdminUser(discordId, owner?.user.tag ?? discordId, ADMIN_ROLE.SUPER);
  }

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  const autoAdminRoleIds = (settings?.autoAdminRoleIds ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (autoAdminRoleIds.length === 0) return null;

  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return null;
  const hasAutoAdminRole = autoAdminRoleIds.some((roleId) => member.roles.cache.has(roleId));
  if (!hasAutoAdminRole) return null;

  return createAutoAdminUser(discordId, member.user.tag, ADMIN_ROLE.MANAGER);
}

export async function requireLinkedAdmin(discordId: string, guild?: Guild | null) {
  const admin = await getLinkedAdmin(discordId);
  if (admin) return admin;

  const autoProvisioned = await tryAutoProvisionAdmin(discordId, guild);
  if (autoProvisioned) return autoProvisioned;

  // "자판기(샵)"를 막 산 테넌트는 이 DB에 관리자 계정이 아예 하나도 없는 상태다 -
  // `/관리자연동`은 ID/비번으로 "기존 계정"에 로그인하는 명령어라 여기선 쓸 수 없고
  // (로그인 시도해도 그 자체로 실패), 웹사이트 /admin/login의 "Discord로 로그인"이
  // 최초 1회에 한해 "이 서버의 Discord 관리자 권한"을 확인해서 SUPER 계정을 자동
  // 발급해준다 - 그게 유일한 부트스트랩 경로이므로 안내를 구분해서 보여준다.
  // (서버 소유자는 위 tryAutoProvisionAdmin에서 이미 자동으로 발급받으므로 여기까지
  // 오지 않는다 - 이 메시지는 소유자가 아닌 다른 사람이 호출한 경우에만 보인다.)
  const adminCount = await prisma.adminUser.count();
  if (adminCount === 0) {
    throw new Error(
      `아직 이 샵에 관리자 계정이 없습니다. 서버 소유자가 아니라면, 서버 소유자가 먼저 명령어를 한 번 사용하거나 ${getAppOrigin()}/admin/login 에서 "Discord로 로그인"을 눌러 최초 관리자 계정을 만들어야 합니다.`
    );
  }
  throw new Error("관리자 계정과 연동되어 있지 않습니다. `/관리자연동` 명령어로 먼저 연동해주세요.");
}

export function requireSuperRole(role: string) {
  if (role !== "SUPER") throw new Error("이 작업은 SUPER 권한 관리자만 수행할 수 있습니다.");
}

const DISCORD_API = "https://discord.com/api/v10";
const PERMISSION_ADMINISTRATOR = BigInt(0x8);

/**
 * 지정된 디스코드 서버(guildId)에서 이 사용자가 "서버 관리자" 권한(Administrator) 또는
 * (자비샵 본인 서버에 한해서만) 지정 관리자 역할(DISCORD_ADMIN_ROLE_ID)을 가지고 있는지
 * 확인한다. 테넌트 서버는 이런 커스텀 역할 개념이 없으므로 Administrator 권한 여부만으로
 * 판단한다. 봇 토큰만으로 조회하므로 사용자 쪽에 추가 OAuth 동의(scope)가 필요 없다.
 */
export async function isDiscordGuildAdmin(discordId: string, guildId: string | null | undefined): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !guildId) return false;

  const memberRes = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!memberRes.ok) return false;
  const member = (await memberRes.json()) as { roles: string[] };

  if (guildId === process.env.DISCORD_GUILD_ID) {
    const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;
    if (adminRoleId && member.roles.includes(adminRoleId)) return true;
  }

  const rolesRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!rolesRes.ok) return false;
  const guildRoles = (await rolesRes.json()) as { id: string; permissions: string }[];

  // @everyone 역할의 id는 항상 서버(guild) id와 같다.
  const roleIds = new Set([guildId, ...member.roles]);
  let combined = BigInt(0);
  for (const role of guildRoles) {
    if (roleIds.has(role.id)) combined |= BigInt(role.permissions);
  }
  return (combined & PERMISSION_ADMINISTRATOR) === PERMISSION_ADMINISTRATOR;
}
