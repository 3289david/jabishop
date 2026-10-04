import { runShopBillingCycle } from "@/lib/shopPurchase";

// 테넌트 샵 구독료(월 4000P)가 밀렸는지는 1시간마다 확인한다. 실제로 결제가
// 필요한(nextBillingAt이 지난) 샵이 있을 때만 포인트를 차감한다.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function startShopBillingLoop() {
  runShopBillingCycle().catch((e) => console.error("자판기 구독 결제 확인 초기 실행 실패:", e));
  setInterval(() => {
    runShopBillingCycle().catch((e) => console.error("자판기 구독 결제 확인 실패:", e));
  }, CHECK_INTERVAL_MS);
}
