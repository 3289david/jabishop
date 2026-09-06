import { prisma } from "@/lib/prisma";
import { USER_STATUS, ADMIN_STATUS } from "@/lib/constants";

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

export async function requireLinkedAdmin(discordId: string) {
  const admin = await getLinkedAdmin(discordId);
  if (!admin) {
    throw new Error("관리자 계정과 연동되어 있지 않습니다. `/관리자연동` 명령어로 먼저 연동해주세요.");
  }
  return admin;
}

export function requireSuperRole(role: string) {
  if (role !== "SUPER") throw new Error("이 작업은 SUPER 권한 관리자만 수행할 수 있습니다.");
}

const DISCORD_API = "https://discord.com/api/v10";
const PERMISSION_ADMINISTRATOR = BigInt(0x8);

/**
 * 지정된 디스코드 서버(DISCORD_GUILD_ID)에서 이 사용자가
 * "서버 관리자" 권한(Administrator) 또는 지정 관리자 역할(DISCORD_ADMIN_ROLE_ID)을 가지고 있는지 확인한다.
 * 봇 토큰만으로 조회하므로 사용자 쪽에 추가 OAuth 동의(scope)가 필요 없다.
 */
export async function isDiscordGuildAdmin(discordId: string): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return false;

  const memberRes = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!memberRes.ok) return false;
  const member = (await memberRes.json()) as { roles: string[] };

  const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;
  if (adminRoleId && member.roles.includes(adminRoleId)) return true;

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
