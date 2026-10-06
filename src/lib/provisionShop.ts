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

type TenantExtraEnv = {
  clientId?: string | null;
  clientSecret?: string | null;
  guildId?: string | null;
};

/**
 * Shop 행의 discordOAuthClientId/Secret/discordGuildId를 그대로 테넌트 프로세스
 * 환경변수로 옮겨 담는다 - OAuth 재등록(/샵봇설정)이나 길드 연동(/샵연동), 주소 변경
 * (/샵주소변경) 중 어느 하나만 바뀌어도 매번 이 함수로 "지금 Shop 행에 있는 값 전부"를
 * 다시 써야 한다. 그래야 한쪽을 갱신하다가 다른 쪽(이미 설정돼 있던 값)을 실수로
 * 지우는 일이 없다.
 */
function buildTenantExtraEnv(shop: {
  discordOAuthClientId?: string | null;
  discordOAuthClientSecret?: string | null;
  discordGuildId?: string | null;
}): TenantExtraEnv {
  return {
    clientId: shop.discordOAuthClientId,
    clientSecret: shop.discordOAuthClientSecret,
    guildId: shop.discordGuildId,
  };
}

function writeTenantEcosystemFile(slug: string, dbPath: string, port: number, extra?: TenantExtraEnv) {
  const oauthEnv =
    extra?.clientId && extra?.clientSecret
      ? `
        DISCORD_CLIENT_ID: ${JSON.stringify(extra.clientId)},
        DISCORD_CLIENT_SECRET: ${JSON.stringify(extra.clientSecret)},
        DISCORD_OAUTH_REDIRECT_URI: ${JSON.stringify(tenantOAuthRedirectUri(slug))},`
      : "";
  // 이 샵이 연동한 디스코드 서버 ID - 이게 주입되어 있어야 이 샵 전용 프로세스에서
  // isDiscordGuildAdmin/syncPurchaseTierRoles/파트너 채널 생성 등이 자비샵 본인 서버가
  // 아니라 이 샵 자신의 서버를 기준으로 동작한다 (src/bot/discordAuth.ts 등 참고).
  const guildEnv = extra?.guildId ? `\n        DISCORD_GUILD_ID: ${JSON.stringify(extra.guildId)},` : "";
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
        DATABASE_URL: "file:${dbPath}",${oauthEnv}${guildEnv}
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
  writeTenantEcosystemFile(slug, shop.dbPath, shop.port, buildTenantExtraEnv(shop));
  await startTenantProcess(slug);
}

/**
 * /샵연동으로 디스코드 서버와 연결됐을 때(혹은 재연동 등으로 바뀔 때) 호출한다.
 * 이 샵 전용 프로세스에 DISCORD_GUILD_ID를 주입해서, 그 서버를 기준으로 관리자 권한
 * 확인(isDiscordGuildAdmin)·구매 등급 역할 지급·파트너 채널/역할 생성 등이 전부
 * "이 샵 자신의 서버"에서 동작하게 한다 (그 전까진 비어있어서 해당 기능들이 아무
 * 효과가 없거나, 환경변수에 값이 없으면 그냥 꺼진 것처럼 동작한다).
 */
export async function applyShopGuildId(slug: string, guildId: string) {
  const shop = await runWithTenant(null, () =>
    prisma.shop.update({ where: { slug }, data: { discordGuildId: guildId } })
  );
  if (shop.status !== "ACTIVE" || shop.port == null) return;
  await stopTenantProcess(slug);
  writeTenantEcosystemFile(slug, shop.dbPath, shop.port, buildTenantExtraEnv(shop));
  await startTenantProcess(slug);
}

/**
 * 샵 주인이 웹사이트 주소(서브도메인)를 원하는 이름으로 직접 바꿀 때 쓴다.
 * 먼저 새 주소의 DNS/nginx를 만들어 기존 주소와 함께 같은 포트를 가리키게 해두고
 * (이 시점까지는 기존 주소도 계속 멀쩡히 동작), 그 다음에만 프로세스를 새 슬러그
 * 이름으로 내렸다 올리고, 마지막에 옛 주소의 DNS/nginx를 지운다 - 실패해도 최대한
 * 기존 주소가 죽지 않게 하기 위한 순서다. OAuth 앱을 이미 등록했었다면 REDIRECT URI가
 * 새 주소 기준으로 바뀌므로, 디스코드 개발자 포털에 다시 등록해야 한다(호출한 쪽에서 안내).
 */
export async function changeShopSlug(oldSlug: string, newSlug: string): Promise<{ url: string }> {
  if (!/^[a-z0-9-]{3,30}$/.test(newSlug)) {
    throw new Error("주소는 영문 소문자/숫자/하이픈 3~30자여야 합니다.");
  }
  if (newSlug === oldSlug) throw new Error("현재와 같은 주소입니다.");
  if (await runWithTenant(null, () => prisma.shop.findUnique({ where: { slug: newSlug } }))) {
    throw new Error("이미 사용 중인 주소입니다.");
  }
  const shop = await runWithTenant(null, () => prisma.shop.findUnique({ where: { slug: oldSlug } }));
  if (!shop) throw new Error("존재하지 않는 샵입니다.");
  if (shop.status !== "ACTIVE" || shop.port == null) {
    throw new Error("활성 상태인 샵만 주소를 바꿀 수 있습니다.");
  }

  const extraEnv = buildTenantExtraEnv(shop);

  let newDnsCreated = false;
  let newNginxWritten = false;
  let oldProcessStopped = false;
  try {
    await createDnsRecord(newSlug);
    newDnsCreated = true;
    writeNginxConfig(newSlug, shop.port);
    newNginxWritten = true;
    await reloadNginx();

    await stopTenantProcess(oldSlug);
    oldProcessStopped = true;
    writeTenantEcosystemFile(newSlug, shop.dbPath, shop.port, extraEnv);
    await startTenantProcess(newSlug);

    await deleteDnsRecord(oldSlug).catch(() => {});
    removeNginxConfig(oldSlug);
    await reloadNginx().catch(() => {});

    await runWithTenant(null, () => prisma.shop.update({ where: { id: shop.id }, data: { slug: newSlug } }));
    return { url: `https://${newSlug}.krl.kr` };
  } catch (e) {
    // 최대한 기존 주소가 계속 동작하도록 되돌린다.
    if (oldProcessStopped) {
      writeTenantEcosystemFile(oldSlug, shop.dbPath, shop.port, extraEnv);
      await startTenantProcess(oldSlug).catch(() => {});
    }
    if (newNginxWritten) removeNginxConfig(newSlug);
    if (newDnsCreated) await deleteDnsRecord(newSlug).catch(() => {});
    await reloadNginx().catch(() => {});
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`주소 변경 실패 (기존 주소는 그대로 유지됩니다): ${message}`);
  }
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
