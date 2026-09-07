import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

function placeholderSvg(title: string, color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  <rect width="800" height="800" fill="${color}"/>
  <text x="50%" y="50%" font-size="36" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${title}</text>
</svg>`;
}

function writePlaceholder(kind: "artworks" | "previews", fileName: string, title: string, color: string) {
  const dir = path.join(UPLOAD_ROOT, kind);
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, placeholderSvg(title, color));
  return `${kind}/${fileName}`;
}

const TIERS = [
  { slug: "bronze", name: "브론즈 랜덤", price: 1900, minCount: 5, maxCount: 15, color: "#8c5a3c", desc: "일반 계정 등급의 랜덤 상품입니다." },
  { slug: "silver", name: "실버 랜덤", price: 4900, minCount: 10, maxCount: 25, color: "#9aa5ad", desc: "고급 계정 등급의 랜덤 상품입니다." },
  { slug: "gold", name: "골드 랜덤", price: 9900, minCount: 20, maxCount: 40, color: "#d4af37", desc: "희귀 계정 등급의 랜덤 상품입니다." },
  { slug: "platinum", name: "플래티넘 랜덤", price: 19900, minCount: 30, maxCount: 60, color: "#8fb9c9", desc: "매우 희귀한 계정 등급의 랜덤 상품입니다." },
  { slug: "diamond", name: "다이아 랜덤", price: 34900, minCount: 40, maxCount: 80, color: "#63c6e0", desc: "최고급 계정 등급의 랜덤 상품입니다." },
  { slug: "ascendant", name: "초월자 랜덤", price: 59900, minCount: 60, maxCount: 100, color: "#5ad1a8", desc: "초희귀 계정 등급의 랜덤 상품입니다." },
  { slug: "immortal", name: "불멸 랜덤", price: 99900, minCount: 80, maxCount: 150, color: "#c94f7c", desc: "최상급 계정 등급의 랜덤 상품입니다." },
];

async function main() {
  await prisma.shopSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      shopName: "자비샵",
      bankName: "국민은행",
      bankAccountNumber: "123456-78-901234",
      bankAccountHolder: "홍길동",
      refundAllowedAfterDownload: false,
      noticeMessage: "입금 확인은 영업일 기준 최대 1시간 이내에 처리됩니다.",
    },
  });

  const superAdminLoginId = process.env.SEED_ADMIN_ID || "admin";
  const superAdminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const existingAdmin = await prisma.adminUser.findUnique({ where: { loginId: superAdminLoginId } });
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        loginId: superAdminLoginId,
        passwordHash: await bcrypt.hash(superAdminPassword, 12),
        name: "최고관리자",
        role: "SUPER",
      },
    });
    console.log(`[seed] 최초 관리자 계정 생성: ${superAdminLoginId} / ${superAdminPassword} (로그인 후 반드시 비밀번호와 2FA를 설정하세요)`);
  }

  const demoEmail = "test@example.com";
  const existingUser = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        email: demoEmail,
        passwordHash: await bcrypt.hash("password1234", 12),
        name: "테스트유저",
        points: 50000,
        isSeedData: true,
      },
    });
    console.log(`[seed] 테스트 유저 생성: ${demoEmail} / password1234 (포인트 50,000P 지급)`);
  }

  for (const t of TIERS) {
    const tier = await prisma.tier.upsert({
      where: { slug: t.slug },
      update: {},
      create: {
        slug: t.slug,
        name: t.name,
        price: t.price,
        minCount: t.minCount,
        maxCount: t.maxCount,
        description: t.desc,
        status: "ON_SALE",
        sortOrder: TIERS.indexOf(t),
      },
    });

    const existingArtworkCount = await prisma.artwork.count({ where: { tierId: tier.id } });
    if (existingArtworkCount > 0) continue;

    const itemCount = 10;
    for (let i = 1; i <= itemCount; i++) {
      const code = `${t.slug.toUpperCase()}-${String(i).padStart(4, "0")}`;
      const fileKey = writePlaceholder("artworks", `${code}.svg`, `${t.name} #${i}`, t.color);
      const previewKey = writePlaceholder("previews", `${code}-preview.svg`, `${t.name} #${i} 미리보기`, t.color);

      await prisma.artwork.create({
        data: {
          code,
          tierId: tier.id,
          title: `${t.name} 계정 ${i}호`,
          fileKey,
          previewKey,
          status: "AVAILABLE",
          isSeedData: true,
        },
      });
    }
  }

  console.log("[seed] 완료");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
