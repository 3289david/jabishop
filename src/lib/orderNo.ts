import { prisma } from "@/lib/prisma";

// 주문번호 형식: YYYYMMDD + 그날 주문 순번 6자리 (예: 20260905000124)
export async function generateOrderNo(): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = `${y}${m}${d}`;

  const startOfDay = new Date(y, now.getMonth(), now.getDate());
  const endOfDay = new Date(y, now.getMonth(), now.getDate() + 1);

  for (let attempt = 0; attempt < 5; attempt++) {
    const countToday = await prisma.order.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    });
    const seq = String(countToday + 1 + attempt).padStart(6, "0");
    const candidate = `${prefix}${seq}`;
    const exists = await prisma.order.findUnique({ where: { orderNo: candidate } });
    if (!exists) return candidate;
  }
  // 극히 드문 충돌 상황에 대한 폴백
  return `${prefix}${Date.now().toString().slice(-9)}`;
}
