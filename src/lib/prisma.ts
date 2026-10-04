import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

// ── 멀티테넌트("자판기 판매") 지원 ────────────────────────────────────────────
// 각 샵(테넌트)은 완전히 분리된 SQLite 파일을 쓴다. 기존 130여개 파일에 shopId를
// 끼워넣는 대신, 요청/인터랙션이 시작되는 지점(웹 미들웨어, 디스코드 인터랙션
// 디스패처)에서만 runWithTenant()로 감싸고, 그 안에서 실행되는 모든 코드가 쓰는
// `prisma`는 AsyncLocalStorage를 통해 자동으로 그 샵의 DB로 연결된다.
// 감싸지 않으면(지금까지의 모든 코드) 항상 자비샵 본인 DB(기본 커넥션)를 그대로
// 쓴다 - 즉 이 파일을 바꿔도 기존 동작은 100% 그대로다.

const globalForPrisma = globalThis as unknown as {
  defaultPrisma?: PrismaClient;
  tenantPrismaClients?: Map<string, PrismaClient>;
};

const defaultPrisma =
  globalForPrisma.defaultPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.defaultPrisma = defaultPrisma;

// dbPath(절대경로)별로 PrismaClient를 캐싱해서 재사용한다 - 요청마다 새로 만들면
// SQLite 커넥션이 계속 쌓인다.
const tenantPrismaClients = globalForPrisma.tenantPrismaClients ?? new Map<string, PrismaClient>();
if (process.env.NODE_ENV !== "production") globalForPrisma.tenantPrismaClients = tenantPrismaClients;

function getTenantClient(dbPath: string): PrismaClient {
  let client = tenantPrismaClients.get(dbPath);
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    tenantPrismaClients.set(dbPath, client);
  }
  return client;
}

const tenantStorage = new AsyncLocalStorage<PrismaClient>();

/**
 * 이 콜백(과 그 안에서 await하는 모든 비동기 코드) 동안에는 어디서든 `prisma.xxx`를
 * 부르면 전부 dbPath가 가리키는 샵의 DB로 간다. dbPath가 null이면 그냥 기본(자비샵
 * 본인) DB를 쓴다 - 웹 미들웨어(호스트명 기준)와 봇 인터랙션 디스패처(guildId 기준)
 * 에서 요청/인터랙션 시작 시점에 이걸로 감싼다.
 */
export function runWithTenant<T>(dbPath: string | null, fn: () => Promise<T>): Promise<T> {
  if (!dbPath) return fn();
  return tenantStorage.run(getTenantClient(dbPath), fn);
}

export const prisma = new Proxy(defaultPrisma, {
  get(target, prop, _receiver) {
    const client = tenantStorage.getStore() ?? target;
    return Reflect.get(client, prop, client);
  },
}) as PrismaClient;
