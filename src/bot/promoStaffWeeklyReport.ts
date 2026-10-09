import { prisma } from "@/lib/prisma";
import { notifyAllAdmins } from "@/lib/discordNotify";
import { computePromoStaffStats } from "@/lib/promoStaff";
import { forEachShop } from "@/lib/shop";

// 정확히 "매주 금요일"을 재는 타이머 대신, 마지막으로 보낸 날짜를 저장해두고 주기적으로
// "오늘이 금요일이고 오늘 아직 안 보냈는지" 체크하는 방식이다 (dailyStatsBroadcast.ts와 동일한
// 이유 - 봇이 재시작돼도 중복/누락 없이 주 1회가 보장된다).
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분마다 체크
const FRIDAY = 5;
const MAX_EMBED_FIELDS = 25;

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function maybeSendPromoReport() {
  const now = new Date();
  if (now.getDay() !== FRIDAY) return;

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (settings?.promoReportLastSentAt && isSameDay(settings.promoReportLastSentAt, now)) return;

  const staffList = await prisma.promoStaff.findMany({ where: { status: "ACTIVE" } });
  if (staffList.length === 0) {
    await prisma.shopSetting.update({ where: { id: "singleton" }, data: { promoReportLastSentAt: now } });
    return;
  }

  const fields = [];
  for (const s of staffList.slice(0, MAX_EMBED_FIELDS)) {
    const stat = await computePromoStaffStats(s.id);
    const bank = s.bankName ? `${s.bankName} ${s.bankAccountNumber} (${s.accountHolder})` : "⚠️ 계좌 미등록";
    fields.push({
      name: `${s.name} (<@${s.discordUserId}>)`,
      value: `초대 ${stat.inviteCount}명(인증완료 ${stat.verifiedCount}명) · 500원↑ 구매자 ${stat.qualifyingCount}명 → **${stat.amountDue.toLocaleString()}원**\n${bank}`,
    });
  }

  await notifyAllAdmins({
    title: "📣 이번 주 홍보직원 정산 안내",
    description: "아래 계좌로 수동 송금해주세요. 이 안내는 자동 집계이며, 실제 지급은 자동으로 이뤄지지 않습니다.",
    color: 0x6366f1,
    fields,
    timestamp: now.toISOString(),
  });

  await prisma.shopSetting.update({ where: { id: "singleton" }, data: { promoReportLastSentAt: now } });
}

async function maybeSendPromoReportForAllShops() {
  await forEachShop(() => maybeSendPromoReport());
}

export function startPromoStaffWeeklyReportLoop() {
  maybeSendPromoReportForAllShops().catch((e) => console.error("홍보직원 주간 정산 안내 초기 실행 실패:", e));
  setInterval(() => {
    maybeSendPromoReportForAllShops().catch((e) => console.error("홍보직원 주간 정산 안내 실패:", e));
  }, CHECK_INTERVAL_MS);
}
