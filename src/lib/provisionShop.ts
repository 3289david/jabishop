// "자판기 판매"로 새 테넌트 샵을 만든다: 전용 SQLite DB 하나만 만든다.
// (한때 전용 서브도메인+nginx+PM2 웹 프로세스까지 자동으로 띄우는 버전이었는데,
// 웹사이트는 제공하지 않기로 해서 그 부분은 전부 뺐다 - 자비샵 본인 웹사이트
// (jabishop.krl.kr)만 그대로 유지한다.)
//
// 디스코드 봇은 별도 프로세스를 안 띄운다 - 같은 봇 토큰으로 여러 프로세스를 띄울 수
// 없어서, 기존 jabishop-bot 하나가 모든 테넌트 길드를 guildId 기준으로 구분해서 처리한다
// (src/lib/shop.ts의 runForGuild, src/bot/index.ts에 이미 연결되어 있음).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma, runWithTenant } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

const TENANT_DB_DIR = "/root/jabishop-tenants";

async function createTenantDb(dbPath: string, shopName: string): Promise<string> {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  await execFileAsync("npx", ["prisma", "migrate", "deploy"], {
    cwd: "/root/jabishop",
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  });
  // 입금알림 앱 웹훅용 비밀키를 이 샵만의 값으로 자동 발급한다 - 다른 샵(자비샵 본인
  // 포함)과 절대 겹치지 않게, 그리고 사람이 따로 정해서 공유할 필요가 없게 하기 위함.
  const bankWebhookSecret = crypto.randomBytes(24).toString("hex");
  await runWithTenant(dbPath, async () => {
    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: { bankWebhookSecret, shopName },
      create: { id: "singleton", shopName, bankName: "", bankAccountNumber: "", bankAccountHolder: "", bankWebhookSecret },
    });
  });
  return bankWebhookSecret;
}

export async function provisionShop(params: {
  slug: string;
  name: string;
  ownerUserId?: string;
  claimDiscordId?: string;
}) {
  const { slug, name, ownerUserId, claimDiscordId } = params;

  if (!/^[a-z0-9-]{3,30}$/.test(slug)) {
    throw new Error("샵 코드는 영문 소문자/숫자/하이픈 3~30자여야 합니다.");
  }
  if (await prisma.shop.findUnique({ where: { slug } })) {
    throw new Error("이미 사용 중인 이름입니다.");
  }

  const dbPath = path.join(TENANT_DB_DIR, `${slug}.db`);

  const shop = await prisma.shop.create({
    data: { slug, name, dbPath, ownerUserId, claimDiscordId, status: "PROVISIONING" },
  });

  try {
    const bankWebhookSecret = await createTenantDb(dbPath, name);

    const nextBillingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.shop.update({ where: { id: shop.id }, data: { status: "ACTIVE", nextBillingAt } });
    return { id: shop.id, slug, dbPath, status: "ACTIVE" as const, bankWebhookSecret };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    fs.rmSync(dbPath, { force: true });
    await prisma.shop.delete({ where: { id: shop.id } }).catch(() => {});
    throw new Error(`샵 생성 실패: ${message}`);
  }
}

/**
 * 결제가 밀려서 즉시 취소할 때 쓴다. 더 이상 만들어둔 외부 인프라(DNS/nginx/프로세스)가
 * 없으니 상태만 CANCELLED로 바꾼다 - 그러면 src/lib/shop.ts의 runForGuild가 이 샵의
 * 길드에서 오는 인터랙션을 더 이상 이 샵 DB로 연결해주지 않는다. DB 파일은 그대로
 * 남겨둬서, 나중에 포인트를 채우면 관리자가 다시 ACTIVE로 되돌릴 수 있다.
 */
export async function teardownShopInfra(slug: string) {
  await prisma.shop.updateMany({ where: { slug }, data: { status: "CANCELLED" } });
}

/** 구독 해지/강제 삭제 시 전체 정리 (DB 파일까지 완전히 지움). */
export async function deprovisionShop(slug: string) {
  const shop = await prisma.shop.findUnique({ where: { slug } });
  if (!shop) throw new Error("존재하지 않는 샵입니다.");
  fs.rmSync(shop.dbPath, { force: true });
  await prisma.shop.delete({ where: { id: shop.id } });
}
