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

// 관리자 근무 상태. ON_DUTY/PAUSED는 디스코드 온라인/오프라인 감지로 자동 전환되고,
// OFF_DUTY(퇴근)는 관리자가 직접 눌러야만 되는 "고정" 상태라 자동 감지로 덮어쓰지 않는다.
export const ADMIN_DUTY_STATUS = {
  ON_DUTY: "ON_DUTY",
  OFF_DUTY: "OFF_DUTY",
  PAUSED: "PAUSED",
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
  // 교환(재추첨)으로 다른 계정으로 대체되어 더 이상 어떤 주문에도 연결되지 않는 상태.
  // 재판매 방지를 위해 재고(AVAILABLE)로 되돌리지 않는다.
  EXCHANGED: "EXCHANGED",
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
  EVENT_REWARD: "EVENT_REWARD",
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

export const EXCHANGE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const PARTNER_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const SELLER_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export const SELLER_TICKET_STATUS = {
  OPEN: "OPEN",
  PAID: "PAID",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  CLOSED: "CLOSED",
} as const;

export const SELLER_REPORT_STATUS = {
  PENDING: "PENDING",
  RESOLVED: "RESOLVED",
} as const;

export const SELLER_REPORT_REASONS = [
  "사기",
  "상품 미제공",
  "허위 상품",
  "가격 문제",
  "욕설/비매너",
  "규정 위반",
  "기타",
] as const;

export const STICKY_KIND = {
  CUSTOM: "CUSTOM",
  ADMIN_PANEL: "ADMIN_PANEL",
  SELLER_PANEL: "SELLER_PANEL",
} as const;

export const RAFFLE_STATUS = {
  OPEN: "OPEN",
  DRAWN: "DRAWN",
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

// 누적 구매금액(포인트 결제 완료 기준) 등급별 자동 할인율과, 해당 등급의
// 디스코드 역할 ID가 저장된 ShopSetting 필드명. 높은 금액대부터 순서대로 검사한다.
// 역할 지급 전용(배지) - 실제 주문 가격에는 아무 영향이 없다. 예전엔 여기 딸린
// discountPercent로 구매할 때마다 쿠폰 할인 위에 몰래 10%/8%/5%를 추가로 더
// 깎아주는 자동 할인이 있었는데, "쿠폰은 항상 명시적으로 고른 것만 적용한다"는
// 이 코드베이스의 원칙과 어긋나는 조용한 매출 손실이라 완전히 제거했다
// (src/lib/orders.ts purchaseTier 참고).
export const PURCHASE_TIER_ROLES = [
  { threshold: 150000, settingKey: "discordRoleTier150k", label: "150,000원 이상" },
  { threshold: 100000, settingKey: "discordRoleTier100k", label: "100,000원 이상" },
  { threshold: 50000, settingKey: "discordRoleTier50k", label: "50,000원 이상" },
  { threshold: 10000, settingKey: "discordRoleTier10k", label: "10,000원 이상" },
  { threshold: 1, settingKey: "discordRoleBuyer", label: "구매자 (1원 이상)" },
] as const;

// "자판기 판매" - 자비샵 자체를 구매해서 자기 이름으로 운영하는 상품의 고정 slug.
// 이 등급은 미리 재고(Artwork)를 채워두는 보통 상품과 달리, 구매할 때마다
// src/lib/orders.ts의 purchaseTier()가 그 자리에서 전용 샵을 만들어 지급한다 -
// 그래서 재고 개념이 없고(항상 구매 가능), 다른 등급들과 똑같은 구매 흐름(상품
// 목록 -> 상세 -> 구매하기)으로 살 수 있다.
export const SHOP_SUBSCRIPTION_TIER_SLUG = "shop-subscription";
export const SHOP_SUBSCRIPTION_PRICE = 4000;
// 자판기 구매 완료 시 사용법 채널(자비샵 본인 서버 전용, 비공개 채널이라 구매자에게
// 1명씩 "채널 보기" 권한을 열어줘야 보인다)을 보라고 DM으로 안내한다.
export const SHOP_SUBSCRIPTION_GUIDE_CHANNEL_ID = "1558492093314236586";

export const SPAM_VIOLATION_TYPE = {
  FLOOD: "FLOOD", // 짧은 시간에 메시지 N개 이상
  DUPLICATE: "DUPLICATE", // 동일/복붙(공백·일부 문자만 다른) 메시지 반복
  REPEAT_CHAR: "REPEAT_CHAR", // 같은 문자를 길게 반복
  CROSS_CHANNEL: "CROSS_CHANNEL", // 여러 채널에 동일 내용 연속 전송
  MENTION_BOMB: "MENTION_BOMB", // 멘션 폭탄
  EMOJI_SPAM: "EMOJI_SPAM", // 이모지 도배
  INVITE_LINK: "INVITE_LINK", // 디스코드 초대 링크 반복
  ATTACHMENT_FLOOD: "ATTACHMENT_FLOOD", // 사진/파일/영상 첨부 도배
  IMAGE_BLOCKED: "IMAGE_BLOCKED", // 사진 업로드 전면 금지 위반
  VIDEO_BLOCKED: "VIDEO_BLOCKED", // 영상 업로드 전면 금지 위반
} as const;

export const SPAM_ACTION = {
  DELETE_ONLY: "DELETE_ONLY",
  TIMEOUT: "TIMEOUT",
} as const;
