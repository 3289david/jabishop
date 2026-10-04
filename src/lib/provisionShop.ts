// "자판기 판매"로 새 테넌트 샵을 실제로 만든다: 전용 SQLite DB, Cloudflare DNS 레코드,
// nginx 서버블록(기존 *.krl.kr 와일드카드 인증서 재사용 - 인증서 새로 발급할 필요 없음),
// 전용 jabishop-web PM2 프로세스까지 전부 자동으로 띄운다.
//
// 테넌트 웹사이트 로그인은 자비샵 OAuth 앱을 공유하지 않는다 - 각 샵 주인이 본인
// 디스코드 개발자 포털에서 만든 앱의 Client ID/Secret을 /샵봇설정으로 등록하면,
// 그 값만 이 샵 전용 프로세스의 환경변수로 주입해서 재시작한다 (코드 변경 없음, 기존
// src/app/api/auth/discord/*가 전부 환경변수 기반이라 이 방식이 그대로 통함).
//
// 디스코드 봇은 별도 프로세스를 안 띄운다 - 같은 봇 토큰으로 여러 프로세스를 띄울 수
// 없어서, 기존 jabishop-bot 하나가 모든 테넌트 길드를 guildId 기준으로 구분해서 처리한다
// (src/lib/shop.ts의 runForGuild, src/bot/index.ts에 이미 연결되어 있음).
//
// 안전장치: 이 스크립트가 실제로 건드리는 외부 자원은 딱 세 가지뿐이다.
//   1) Cloudflare krl.kr zone의 DNS 레코드 (다른 zone은 절대 건드리지 않음)
//   2) /etc/nginx/sites-enabled/<slug>.krl.kr 파일 하나 (다른 vhost는 안 건드림)
//   3) pm2 프로세스 "shop-<slug>-web" 하나
// 실패하면 지금까지 만든 것만 정확히 되돌린다(cleanupShop).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma, runWithTenant } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

const SERVER_IP = "194.163.184.59"; // jabishop.krl.kr 등 이 서버의 다른 앱들과 동일한 공인 IP
const WILDCARD_CERT_DIR = "/etc/letsencrypt/live/krl.kr-0001"; // 기존 *.krl.kr 와일드카드 인증서
const PORT_RANGE_START = 4100;
const PORT_RANGE_END = 4999;
const TENANT_DB_DIR = "/root/jabishop-tenants";
const CLOUDFLARE_INI = "/root/.cloudflare-burnae-app.ini";
const NGINX_SITES_DIR = "/etc/nginx/sites-enabled";

export function tenantOAuthRedirectUri(slug: string): string {
  return `https://${slug}.krl.kr/api/auth/discord/callback`;
}
export function tenantAdminOAuthRedirectUri(slug: string): string {
  return `https://${slug}.krl.kr/api/auth/discord/admin-callback`;
}

function readCloudflareToken(): string {
  const content = fs.readFileSync(CLOUDFLARE_INI, "utf8");
  const match = content.match(/dns_cloudflare_api_token\s*=\s*(.+)/);
  if (!match) throw new Error("Cloudflare API 토큰을 찾을 수 없습니다 (" + CLOUDFLARE_INI + ").");
  return match[1].trim();
}

async function cloudflareApi(method: string, pathSuffix: string, body?: unknown) {
  const token = readCloudflareToken();
  const res = await fetch(`https://api.cloudflare.com/client/v4${pathSuffix}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; result: any; errors?: unknown };
  if (!json.success) throw new Error(`Cloudflare API 오류: ${JSON.stringify(json.errors)}`);
  return json;
}

let cachedZoneId: string | null = null;
async function getKrlKrZoneId(): Promise<string> {
  if (cachedZoneId) return cachedZoneId;
  const json = await cloudflareApi("GET", "/zones?name=krl.kr");
  const zone = json.result[0];
  if (!zone) throw new Error("krl.kr zone을 Cloudflare에서 찾을 수 없습니다.");
  cachedZoneId = zone.id;
  return zone.id;
}

async function createDnsRecord(slug: string) {
  const zoneId = await getKrlKrZoneId();
  await cloudflareApi("POST", `/zones/${zoneId}/dns_records`, {
    type: "A",
    name: `${slug}.krl.kr`,
    content: SERVER_IP,
    proxied: true,
  });
}

async function deleteDnsRecord(slug: string) {
  const zoneId = await getKrlKrZoneId();
  const list = await cloudflareApi("GET", `/zones/${zoneId}/dns_records?name=${slug}.krl.kr`);
  for (const rec of list.result as { id: string }[]) {
    await cloudflareApi("DELETE", `/zones/${zoneId}/dns_records/${rec.id}`);
  }
}

async function allocatePort(): Promise<number> {
  const used = await runWithTenant(null, () =>
    prisma.shop.findMany({ where: { port: { not: null } }, select: { port: true } })
  );
  const usedSet = new Set(used.map((u) => u.port));
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedSet.has(port)) return port;
  }
  throw new Error("할당 가능한 포트가 남아있지 않습니다.");
}

function nginxConfigPath(slug: string) {
  return path.join(NGINX_SITES_DIR, `${slug}.krl.kr`);
}

function writeNginxConfig(slug: string, port: number) {
  const config = `server {
    listen 80;
    listen [::]:80;
    server_name ${slug}.krl.kr;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${slug}.krl.kr;

    client_max_body_size 20M;

    ssl_certificate     ${WILDCARD_CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${WILDCARD_CERT_DIR}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:tenant_${slug.replace(/-/g, "_")}:10m;
    ssl_session_timeout 10m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }
}
`;
  fs.writeFileSync(nginxConfigPath(slug), config);
}

function removeNginxConfig(slug: string) {
  const p = nginxConfigPath(slug);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

async function reloadNginx() {
  await execFileAsync("nginx", ["-t"]);
  await execFileAsync("systemctl", ["reload", "nginx"]);
}

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

function ecosystemConfigPath(slug: string) {
  return path.join(TENANT_DB_DIR, `${slug}.ecosystem.config.js`);
}

function writeTenantEcosystemFile(
  slug: string,
  dbPath: string,
  port: number,
  oauth?: { clientId: string; clientSecret: string }
) {
  const oauthEnv = oauth
    ? `
        DISCORD_CLIENT_ID: ${JSON.stringify(oauth.clientId)},
        DISCORD_CLIENT_SECRET: ${JSON.stringify(oauth.clientSecret)},
        DISCORD_OAUTH_REDIRECT_URI: ${JSON.stringify(tenantOAuthRedirectUri(slug))},`
    : "";
  const config = `module.exports = {
  apps: [
    {
      name: "shop-${slug}-web",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/root/jabishop",
      env: {
        NODE_ENV: "production",
        PORT: "${port}",
        DATABASE_URL: "file:${dbPath}",${oauthEnv}
      },
    },
  ],
};
`;
  fs.writeFileSync(ecosystemConfigPath(slug), config);
}

async function startTenantProcess(slug: string) {
  await execFileAsync("pm2", ["start", ecosystemConfigPath(slug)]);
  await execFileAsync("pm2", ["save"]);
}

async function stopTenantProcess(slug: string) {
  await execFileAsync("pm2", ["delete", `shop-${slug}-web`]).catch(() => {});
  await execFileAsync("pm2", ["save"]).catch(() => {});
  const p = ecosystemConfigPath(slug);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** 프로비저닝 중간에 실패했을 때, 그때까지 만들어진 것만 정확히 되돌린다. */
async function cleanupShop(slug: string, dbPath: string) {
  await deleteDnsRecord(slug).catch(() => {});
  removeNginxConfig(slug);
  await reloadNginx().catch(() => {});
  await stopTenantProcess(slug);
  fs.rmSync(dbPath, { force: true });
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
  if (await runWithTenant(null, () => prisma.shop.findUnique({ where: { slug } }))) {
    throw new Error("이미 사용 중인 이름입니다.");
  }

  const dbPath = path.join(TENANT_DB_DIR, `${slug}.db`);
  const port = await allocatePort();

  const shop = await runWithTenant(null, () =>
    prisma.shop.create({ data: { slug, name, dbPath, port, ownerUserId, claimDiscordId, status: "PROVISIONING" } })
  );

  try {
    const bankWebhookSecret = await createTenantDb(dbPath, name);
    await createDnsRecord(slug);
    writeNginxConfig(slug, port);
    await reloadNginx();
    // OAuth 앱은 구매 시점엔 아직 없다(구매자가 /샵봇설정으로 나중에 등록) - 그 전까지는
    // 웹사이트 자체는 뜨지만 로그인 버튼을 눌러도 동작하지 않는다(설정 안내문에 명시).
    writeTenantEcosystemFile(slug, dbPath, port);
    await startTenantProcess(slug);

    const nextBillingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await runWithTenant(null, () =>
      prisma.shop.update({ where: { id: shop.id }, data: { status: "ACTIVE", nextBillingAt } })
    );
    return {
      id: shop.id,
      slug,
      port,
      dbPath,
      url: `https://${slug}.krl.kr`,
      status: "ACTIVE" as const,
      bankWebhookSecret,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await cleanupShop(slug, dbPath);
    await runWithTenant(null, () => prisma.shop.delete({ where: { id: shop.id } })).catch(() => {});
    throw new Error(`샵 생성 실패: ${message}`);
  }
}

/**
 * 샵 주인이 /샵봇설정으로 본인 디스코드 OAuth 앱(Client ID/Secret)을 등록하거나
 * 바꿀 때 호출한다. 이 샵 전용 프로세스의 환경변수만 갈아끼우고 재시작한다 -
 * 코드 변경 없이 기존 src/app/api/auth/discord/* 가 환경변수를 그대로 읽는 구조라
 * 이 방식이 그대로 통한다.
 */
export async function applyShopOAuthCredentials(slug: string, clientId: string, clientSecret: string) {
  const shop = await runWithTenant(null, () =>
    prisma.shop.update({
      where: { slug },
      data: { discordOAuthClientId: clientId, discordOAuthClientSecret: clientSecret },
    })
  );
  if (shop.status !== "ACTIVE" || shop.port == null) return;
  await stopTenantProcess(slug);
  writeTenantEcosystemFile(slug, shop.dbPath, shop.port, { clientId, clientSecret });
  await startTenantProcess(slug);
}

/**
 * 결제가 밀려서 즉시 취소할 때 쓴다. DNS/nginx/프로세스는 바로 내리지만, DB 파일은
 * 지우지 않고 남겨둔다 - 나중에 밀린 포인트를 채우면 관리자가 다시 provisionShop을
 * 호출해 그대로 복구할 수 있게 하기 위함 (Shop 행 자체도 지우지 않고 CANCELLED로만 표시).
 */
export async function teardownShopInfra(slug: string) {
  await deleteDnsRecord(slug).catch(() => {});
  removeNginxConfig(slug);
  await reloadNginx().catch(() => {});
  await stopTenantProcess(slug);
  await runWithTenant(null, () => prisma.shop.updateMany({ where: { slug }, data: { status: "CANCELLED" } }));
}

/** 구독 해지/강제 삭제 시 전체 정리 (DB 파일까지 완전히 지움). */
export async function deprovisionShop(slug: string) {
  const shop = await runWithTenant(null, () => prisma.shop.findUnique({ where: { slug } }));
  if (!shop) throw new Error("존재하지 않는 샵입니다.");
  await cleanupShop(slug, shop.dbPath);
  await runWithTenant(null, () => prisma.shop.delete({ where: { id: shop.id } }));
}
