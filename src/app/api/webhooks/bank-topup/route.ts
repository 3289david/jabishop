import type { NextRequest } from "next/server";
import { handleBankTopupWebhook } from "@/lib/bankWebhook";

// 자비샵 본인 전용 (jabishop.krl.kr). 테넌트 샵은 /api/webhooks/bank-topup/[slug]를 쓴다.
export async function POST(req: NextRequest) {
  return handleBankTopupWebhook(req);
}
