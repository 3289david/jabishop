import { checkStaleRequests } from "@/lib/staleRequests";
import { forEachShop } from "@/lib/shop";

// 방치된 환불/교환 요청은 1시간마다 확인한다 (실제 재알림 간격은 12시간, checkStaleRequests 내부에서 제어).
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function checkStaleRequestsForAllShops() {
  await forEachShop(() => checkStaleRequests());
}

export function startStaleRequestsLoop() {
  checkStaleRequestsForAllShops().catch((e) => console.error("방치된 요청 확인 초기 실행 실패:", e));
  setInterval(() => {
    checkStaleRequestsForAllShops().catch((e) => console.error("방치된 요청 확인 실패:", e));
  }, CHECK_INTERVAL_MS);
}
