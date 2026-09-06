// 애플리케이션 전역에서 사용하는 상태값 상수.
// SQLite + Prisma는 네이티브 enum을 지원하지 않아 문자열 컬럼으로 저장하므로,
// 아래 상수를 통해서만 값을 비교/대입한다.

export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export const ADMIN_ROLE = {
  SUPER: "SUPER",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
} as const;

export const ADMIN_STATUS = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

export const TIER_STATUS = {
  ON_SALE: "ON_SALE",
  HIDDEN: "HIDDEN",
  SOLD_OUT: "SOLD_OUT",
} as const;

export const ARTWORK_STATUS = {
  AVAILABLE: "AVAILABLE",
  RESERVED: "RESERVED",
  SOLD: "SOLD",
  HIDDEN: "HIDDEN",
} as const;

export const ORDER_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  RESERVED: "RESERVED",
  PAID: "PAID",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  REFUND_REQUESTED: "REFUND_REQUESTED",
  REFUNDED: "REFUNDED",
} as const;

export const POINT_TX_TYPE = {
  CHARGE: "CHARGE",
  USE: "USE",
  REFUND: "REFUND",
  ADMIN_ADJUST: "ADMIN_ADJUST",
  EXPIRE: "EXPIRE",
} as const;

export const TOPUP_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
} as const;

export const REFUND_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED",
} as const;

export const DISCOUNT_TYPE = {
  AMOUNT: "AMOUNT",
  RATE: "RATE",
} as const;

export const REVIEW_STATUS = {
  VISIBLE: "VISIBLE",
  HIDDEN: "HIDDEN",
} as const;

export const INQUIRY_STATUS = {
  WAITING: "WAITING",
  PROCESSING: "PROCESSING",
  ANSWERED: "ANSWERED",
  CLOSED: "CLOSED",
} as const;

export const REPORT_TARGET_TYPE = {
  PRODUCT: "PRODUCT",
  REVIEW: "REVIEW",
  USER: "USER",
  OTHER: "OTHER",
} as const;

export const REPORT_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  RESOLVED: "RESOLVED",
  REJECTED: "REJECTED",
} as const;

// 결제 시작 후 입금 확인 전까지 재고를 잡아두는 시간(분).
// 이 시간이 지나면 예약이 자동 만료되어 재고가 풀린다.
export const RESERVATION_HOLD_MINUTES = 30;

export const ARTWORK_CATEGORIES = [
  "유화",
  "수채화",
  "디지털아트",
  "스케치",
  "아크릴화",
  "일러스트",
  "기타",
];

// 누적 구매금액(포인트 결제 완료 기준) 등급별 자동 할인율과, 해당 등급의
// 디스코드 역할 ID가 저장된 ShopSetting 필드명. 높은 금액대부터 순서대로 검사한다.
export const PURCHASE_TIER_ROLES = [
  { threshold: 150000, discountPercent: 10, settingKey: "discordRoleTier150k", label: "150,000원 이상" },
  { threshold: 100000, discountPercent: 8, settingKey: "discordRoleTier100k", label: "100,000원 이상" },
  { threshold: 50000, discountPercent: 5, settingKey: "discordRoleTier50k", label: "50,000원 이상" },
  { threshold: 10000, discountPercent: 0, settingKey: "discordRoleTier10k", label: "10,000원 이상" },
  { threshold: 1, discountPercent: 0, settingKey: "discordRoleBuyer", label: "구매자 (1원 이상)" },
] as const;

export function getPurchaseTierDiscountPercent(cumulativeSpend: number): number {
  for (const tier of PURCHASE_TIER_ROLES) {
    if (cumulativeSpend >= tier.threshold) return tier.discountPercent;
  }
  return 0;
}
