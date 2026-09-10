// 안드로이드 알림 리스너 앱이 은행 입금 알림을 감지해 이 서버로 전달하면, 금액+입금자명이
// 정확히 하나의 대기중인 충전 신청과 일치할 때만 자동으로 승인한다. 애매하면(0건/2건 이상
// 일치) 절대 자동 승인하지 않고 관리자에게 알림만 보낸다 - 잘못된 자동 승인은 실제 돈 문제로
// 이어지므로 "확실할 때만 자동, 아니면 사람이 본다"를 최우선으로 한다.

function normalizeName(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

/**
 * 은행 알림은 개인정보 보호를 위해 입금자명 일부를 마스킹해서 보내는 경우가 많다
 * (예: "홍*동"). 마스킹(*) 위치를 제외한 나머지 글자가 모두 일치하면 같은 사람으로 본다.
 * 실제 알림 포맷은 은행/기기마다 달라서, 운영해보면서 조정이 필요할 수 있다.
 */
export function depositorNamesMatch(submittedByUser: string, fromBankNotification: string): boolean {
  const a = normalizeName(submittedByUser);
  const b = normalizeName(fromBankNotification);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (b[i] === "*") continue;
    if (a[i] !== b[i]) return false;
  }
  return true;
}
