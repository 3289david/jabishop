import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const USER_COOKIE = "jbs_session";
const ADMIN_COOKIE = "jbs_admin_session";
const SESSION_DAYS = 7;
const ADMIN_SESSION_HOURS = 12;

function secretKey(name: "SESSION_SECRET" | "ADMIN_SESSION_SECRET") {
  const s = process.env[name];
  if (!s) throw new Error(`${name} is not set`);
  return new TextEncoder().encode(s);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function clientInfo() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  const userAgent = h.get("user-agent") || "unknown";
  return { ip, userAgent };
}

// ── 사용자 세션 ──────────────────────────────────────────────

export async function createUserSession(userId: string) {
  const jti = randomUUID();
  const token = await new SignJWT({ sub: userId, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey("SESSION_SECRET"));

  const { ip, userAgent } = await clientInfo();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: { userId, tokenHash: hashToken(jti), ip, userAgent, expiresAt },
  });

  const c = await cookies();
  c.set(USER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function getCurrentUser() {
  const c = await cookies();
  const token = c.get(USER_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey("SESSION_SECRET"));
    const jti = payload.jti as string | undefined;
    const userId = payload.sub as string | undefined;
    if (!jti || !userId) return null;

    const session = await prisma.userSession.findUnique({
      where: { tokenHash: hashToken(jti) },
    });
    if (!session || session.expiresAt < new Date()) return null;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "ACTIVE") return null;
    return user;
  } catch {
    return null;
  }
}

export async function destroyUserSession() {
  const c = await cookies();
  const token = c.get(USER_COOKIE)?.value;
  c.delete(USER_COOKIE);
  if (!token) return;
  try {
    const { payload } = await jwtVerify(token, secretKey("SESSION_SECRET"));
    const jti = payload.jti as string | undefined;
    if (jti) {
      await prisma.userSession
        .delete({ where: { tokenHash: hashToken(jti) } })
        .catch(() => {});
    }
  } catch {
    // ignore invalid token on logout
  }
}

// ── 관리자 세션 ──────────────────────────────────────────────

export async function createAdminSession(adminId: string) {
  const jti = randomUUID();
  const token = await new SignJWT({ sub: adminId, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_HOURS}h`)
    .sign(secretKey("ADMIN_SESSION_SECRET"));

  const { ip, userAgent } = await clientInfo();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);

  await prisma.adminSession.create({
    data: { adminId, tokenHash: hashToken(jti), ip, userAgent, expiresAt },
  });

  const c = await cookies();
  c.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_HOURS * 60 * 60,
  });
}

export async function getCurrentAdmin() {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey("ADMIN_SESSION_SECRET"));
    const jti = payload.jti as string | undefined;
    const adminId = payload.sub as string | undefined;
    if (!jti || !adminId) return null;

    const session = await prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(jti) },
    });
    if (!session || session.expiresAt < new Date()) return null;

    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin || admin.status !== "ACTIVE") return null;
    return admin;
  } catch {
    return null;
  }
}

export async function destroyAdminSession() {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE)?.value;
  c.delete(ADMIN_COOKIE);
  if (!token) return;
  try {
    const { payload } = await jwtVerify(token, secretKey("ADMIN_SESSION_SECRET"));
    const jti = payload.jti as string | undefined;
    if (jti) {
      await prisma.adminSession
        .delete({ where: { tokenHash: hashToken(jti) } })
        .catch(() => {});
    }
  } catch {
    // ignore invalid token on logout
  }
}

export async function getClientInfo() {
  return clientInfo();
}
