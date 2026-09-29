import { checkRestockSubscriptions } from "@/lib/restock";

// 재고가 0개인 등급에 재입고 알림을 신청해둔 회원이 있는지는 5분마다 확인한다.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function startRestockCheckLoop() {
  checkRestockSubscriptions().catch((e) => console.error("재입고 알림 확인 초기 실행 실패:", e));
  setInterval(() => {
    checkRestockSubscriptions().catch((e) => console.error("재입고 알림 확인 실패:", e));
  }, CHECK_INTERVAL_MS);
}
